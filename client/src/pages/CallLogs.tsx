import React, { useState, useEffect, useCallback } from 'react';
import { Search, Download, Play, CheckCircle2, XCircle, AlertCircle, Clock, Database, X, MessageSquare, User, Bot, FileText, Pause, Phone, Megaphone } from 'lucide-react';
import { api } from '../services/api';
import type { CallStatus } from '../../../shared/types';
import { useBackend } from '../context/BackendContext';

interface CallEntry {
  id: string;
  agentName: string;
  phoneNumber: string | null;
  campaignName: string | null;
  status: string;
  successful: string;
  duration: number;
  messages: number;
  language: string;
  timestamp: number; // unix ms
  callSid: string | null;
  conversationId: string | null; // elevenlabs conversation linked to this call
  recordingUrl: string | null;
  transcript: string | null;
}

interface TranscriptEntry {
  role: 'agent' | 'user';
  message: string;
  time_in_call_secs: number;
}

interface ConversationDetail {
  conversation_id: string;
  agent_name: string;
  status: string;
  has_audio: boolean;
  transcript: TranscriptEntry[];
  metadata: {
    start_time_unix_secs: number;
    call_duration_secs: number;
    cost: number;
    main_language: string;
    termination_reason: string;
  };
  analysis: {
    call_successful: string;
    transcript_summary: string;
    call_summary_title: string;
  };
}

const CallLogs: React.FC = () => {
  const { logs: contextLogs } = useBackend();

  const [entries, setEntries] = useState<CallEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState('');

  // Detail modal
  const [selectedEntry, setSelectedEntry] = useState<CallEntry | null>(null);
  const [convDetail, setConvDetail] = useState<ConversationDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [audioPlaying, setAudioPlaying] = useState(false);
  const [audioRef] = useState<{ current: HTMLAudioElement | null }>({ current: null });

  // SQLite datetime('now') returns "YYYY-MM-DD HH:MM:SS" in UTC but without timezone indicator.
  // JavaScript new Date() treats strings without 'Z' or 'T' as LOCAL time, shifting by IST offset.
  // Fix: convert to proper ISO 8601 format with 'Z' suffix to force UTC parsing.
  const parseUTCTimestamp = (ts: string): number => {
    if (!ts) return 0;
    const iso = ts.replace(' ', 'T');
    return new Date(iso.endsWith('Z') ? iso : iso + 'Z').getTime();
  };

  // Build entries from call logs
  const buildEntries = useCallback((callLogs: any[]): CallEntry[] => {
    return callLogs.map((log: any) => ({
      id: `call-${log.id}`,
      agentName: log.agentName || 'Unknown Agent',
      phoneNumber: log.phoneNumber || null,
      campaignName: log.campaignName || null,
      status: log.status || 'unknown',
      successful: log.status === 'completed' ? 'success' : log.status === 'failed' ? 'failure' : 'unknown',
      duration: log.duration || 0,
      messages: 0,
      language: '',
      timestamp: parseUTCTimestamp(log.timestamp),
      callSid: log.sid,
      conversationId: log.elevenLabsConversationId || null,
      recordingUrl: log.recordingUrl || null,
      transcript: log.transcript || null,
    })).sort((a, b) => b.timestamp - a.timestamp);
  }, []);

  // Fetch call logs
  const fetchAll = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const logsResult = await api.getCallLogs({ limit: 100 });
      const callLogs = logsResult.logs;
      console.log(`[CallLogs] Fetched ${callLogs.length} call logs`);
      setEntries(buildEntries(callLogs));
    } catch (err: any) {
      console.error('[CallLogs] Failed to fetch call logs:', err);
      setError(err.message || 'Failed to fetch call logs');
    }

    setLoading(false);
  }, [buildEntries]);

  // Initial fetch on mount
  useEffect(() => { fetchAll(); }, [fetchAll]);

  // Re-fetch when context logs change (status updates, new calls, recordings saved)
  const lastFetchRef = React.useRef(0);
  useEffect(() => {
    const now = Date.now();
    if (now - lastFetchRef.current < 2000) return;
    lastFetchRef.current = now;
    fetchAll();
  }, [contextLogs]);

  // Filter
  const filtered = search
    ? entries.filter(e =>
      e.agentName.toLowerCase().includes(search.toLowerCase()) ||
      (e.phoneNumber || '').includes(search) ||
      (e.campaignName || '').toLowerCase().includes(search.toLowerCase()) ||
      (e.callSid || '').toLowerCase().includes(search.toLowerCase())
    )
    : entries;

  // Track retry state for AI summary
  const summaryRetryRef = React.useRef<{ timer: ReturnType<typeof setTimeout> | null; count: number }>({ timer: null, count: 0 });
  const [summaryGenerating, setSummaryGenerating] = useState(false);

  // Open detail
  const openDetail = async (entry: CallEntry) => {
    setSelectedEntry(entry);
    setConvDetail(null);
    setAudioPlaying(false);
    setSummaryGenerating(false);
    setDetailError(null);
    if (summaryRetryRef.current.timer) { clearTimeout(summaryRetryRef.current.timer); }
    summaryRetryRef.current = { timer: null, count: 0 };
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }

    // If it has an ElevenLabs conversation ID, fetch the full detail
    const convId = entry.conversationId;
    if (convId) {
      setDetailLoading(true);
      try {
        const detail = await api.getConversationDetails(convId);
        setConvDetail(detail);
        setDetailError(null);

        // Sync detail data back into the entries list so the table stays accurate
        if (detail?.metadata?.call_duration_secs != null || detail?.status) {
          setEntries(prev => prev.map(e =>
            e.conversationId === convId
              ? {
                  ...e,
                  duration: detail.metadata?.call_duration_secs ?? e.duration,
                  status: detail.status === 'done' ? 'completed' : (detail.status || e.status),
                  successful: detail.analysis?.call_successful || e.successful,
                  messages: detail.transcript?.length || e.messages,
                  language: detail.metadata?.main_language || e.language,
                }
              : e
          ));
        }

        // If analysis/summary not ready yet, auto-retry (ElevenLabs processes asynchronously)
        if (!detail?.analysis?.transcript_summary && detail?.status !== 'failed') {
          setSummaryGenerating(true);
          scheduleRetryFetch(convId, 1);
        }
      } catch (err: any) {
        console.error('Failed to load conversation details:', err);
        const msg = err?.message || 'Unknown error';
        if (msg.includes('not_found') || msg.includes('not found') || msg.includes('404')) {
          setDetailError('Conversation not found on ElevenLabs. It may have been deleted or expired.');
        } else {
          setDetailError(`Failed to load conversation details: ${msg}`);
        }
      } finally {
        setDetailLoading(false);
      }
    }
  };

  const scheduleRetryFetch = (convId: string, attempt: number) => {
    const maxRetries = 3;
    if (attempt > maxRetries) {
      setSummaryGenerating(false);
      return;
    }
    const delay = attempt * 10000; // 10s, 20s, 30s
    summaryRetryRef.current.count = attempt;
    summaryRetryRef.current.timer = setTimeout(async () => {
      try {
        const detail = await api.getConversationDetails(convId);
        setConvDetail(detail);
        if (detail?.analysis?.transcript_summary) {
          setSummaryGenerating(false);
          if (detail.metadata?.call_duration_secs) {
            setSelectedEntry(prev => prev ? { ...prev, duration: detail.metadata.call_duration_secs } : prev);
            setEntries(prev => prev.map(e =>
              e.conversationId === convId
                ? {
                    ...e,
                    duration: detail.metadata?.call_duration_secs ?? e.duration,
                    status: detail.status === 'done' ? 'completed' : (detail.status || e.status),
                    successful: detail.analysis?.call_successful || e.successful,
                    messages: detail.transcript?.length || e.messages,
                  }
                : e
            ));
          }
        } else if (attempt < maxRetries) {
          scheduleRetryFetch(convId, attempt + 1);
        } else {
          setSummaryGenerating(false);
        }
      } catch {
        setSummaryGenerating(false);
      }
    }, delay);
  };

  const closeDetail = () => {
    setSelectedEntry(null);
    setConvDetail(null);
    setDetailLoading(false);
    setDetailError(null);
    setSummaryGenerating(false);
    if (summaryRetryRef.current.timer) { clearTimeout(summaryRetryRef.current.timer); }
    summaryRetryRef.current = { timer: null, count: 0 };
    if (audioRef.current) { audioRef.current.pause(); audioRef.current = null; }
    setAudioPlaying(false);
    setAudioError(false);
  };

  const getAudioUrl = (entry: CallEntry): string | null => {
    if (entry.recordingUrl) return entry.recordingUrl;
    if (entry.conversationId) return api.getConversationAudioUrl(entry.conversationId);
    return null;
  };

  const [audioError, setAudioError] = useState(false);

  const toggleAudio = (url: string) => {
    if (audioRef.current) {
      if (audioPlaying) { audioRef.current.pause(); setAudioPlaying(false); }
      else { audioRef.current.play().catch(() => setAudioError(true)); setAudioPlaying(true); }
      return;
    }
    setAudioError(false);
    const audio = new Audio(url);
    audio.onended = () => setAudioPlaying(false);
    audio.onerror = () => { setAudioPlaying(false); setAudioError(true); };
    audio.play().catch(() => { setAudioPlaying(false); setAudioError(true); });
    audioRef.current = audio;
    setAudioPlaying(true);
  };

  const parseTwilioTranscript = (transcript: string | null): { role: string; text: string }[] => {
    if (!transcript) return [];
    try {
      const parsed = JSON.parse(transcript);
      if (Array.isArray(parsed)) return parsed.map((t: any) => ({ role: t.role || t.speaker || 'unknown', text: t.message || t.text || '' }));
    } catch {
      return transcript.split('\n').filter(Boolean).map(line => {
        const match = line.match(/^\[?(agent|user|assistant)\]?:?\s*(.*)/i);
        if (match) return { role: match[1].toLowerCase(), text: match[2] };
        return { role: 'unknown', text: line };
      });
    }
    return [];
  };

  const formatDuration = (secs: number) => {
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return m > 0 ? `${m}m ${s}s` : `${s}s`;
  };

  const getStatusIcon = (status: string, successful?: string) => {
    if (status === 'completed' || (status === 'done' && successful === 'success')) return <CheckCircle2 className="w-4 h-4 text-emerald-500" />;
    if (status === 'failed' || successful === 'failure') return <XCircle className="w-4 h-4 text-red-500" />;
    if (status === 'connected' || status === 'in-progress') return <Clock className="w-4 h-4 text-blue-500 animate-pulse" />;
    if (status === 'ringing' || status === 'processing') return <Clock className="w-4 h-4 text-amber-500" />;
    return <AlertCircle className="w-4 h-4 text-slate-300" />;
  };

  const [exporting, setExporting] = useState(false);
  const [showExportModal, setShowExportModal] = useState(false);

  const exportFields = [
    { key: 'agent', label: 'Agent', default: true },
    { key: 'phone', label: 'Phone Number', default: true },
    { key: 'campaign', label: 'Campaign', default: true },
    { key: 'status', label: 'Status', default: true },
    { key: 'duration', label: 'Duration (s)', default: true },
    { key: 'timestamp', label: 'Timestamp (IST)', default: true },
    { key: 'summary', label: 'AI Summary', default: false },
    { key: 'callSid', label: 'Call SID', default: false },
    { key: 'successful', label: 'Success Result', default: false },
    { key: 'language', label: 'Language', default: false },
    { key: 'messages', label: 'Message Count', default: false },
  ] as const;

  const [selectedExportFields, setSelectedExportFields] = useState<Set<string>>(
    new Set(exportFields.filter(f => f.default).map(f => f.key))
  );

  const toggleExportField = (key: string) => {
    setSelectedExportFields(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const handleExportCSV = async () => {
    if (filtered.length === 0) return;
    setExporting(true);
    setShowExportModal(false);

    const needSummary = selectedExportFields.has('summary');
    const summaryMap = new Map<string, string>();

    if (needSummary) {
      const convIds = filtered.map(e => e.conversationId).filter(Boolean) as string[];
      if (convIds.length > 0) {
        const results = await Promise.allSettled(
          convIds.map(id => api.getConversationDetails(id))
        );
        results.forEach((result, i) => {
          if (result.status === 'fulfilled' && result.value?.analysis?.transcript_summary) {
            summaryMap.set(convIds[i], result.value.analysis.transcript_summary);
          }
        });
      }
    }

    const escapeCsv = (val: string) => `"${val.replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim().replace(/"/g, '""')}"`;

    const fieldGetters: Record<string, { header: string; value: (e: CallEntry) => string }> = {
      agent: { header: 'Agent', value: e => escapeCsv(e.agentName) },
      phone: { header: 'Phone Number', value: e => e.phoneNumber || '' },
      campaign: { header: 'Campaign', value: e => escapeCsv(e.campaignName || '') },
      status: { header: 'Status', value: e => e.status },
      duration: { header: 'Duration (s)', value: e => String(e.duration) },
      timestamp: { header: 'Timestamp (IST)', value: e => escapeCsv(new Date(e.timestamp).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' })) },
      summary: { header: 'AI Summary', value: e => escapeCsv(e.conversationId ? (summaryMap.get(e.conversationId) || '') : '') },
      callSid: { header: 'Call SID', value: e => e.callSid || '' },
      successful: { header: 'Success Result', value: e => e.successful },
      language: { header: 'Language', value: e => e.language },
      messages: { header: 'Message Count', value: e => String(e.messages) },
    };

    const activeFields = exportFields.filter(f => selectedExportFields.has(f.key));
    const headers = activeFields.map(f => fieldGetters[f.key].header);
    const rows = filtered.map(e => activeFields.map(f => fieldGetters[f.key].value(e)));

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `call-logs-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Call Logs</h1>
          <p className="text-slate-500">All voice AI call interactions</p>
        </div>
        <div className="flex items-center gap-2">
          <button onClick={fetchAll} className="px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition">Refresh</button>
          <button onClick={() => setShowExportModal(true)} disabled={exporting || filtered.length === 0} className="flex items-center gap-2 bg-slate-900 text-white px-4 py-2 rounded-xl text-sm font-semibold hover:bg-slate-800 transition disabled:opacity-50 disabled:cursor-wait">
            {exporting ? (
              <><div className="animate-spin w-4 h-4 border-2 border-white border-t-transparent rounded-full"></div>Exporting...</>
            ) : (
              <><Download className="w-4 h-4" />Export CSV</>
            )}
          </button>
        </div>
      </div>

      {/* Error Banner */}
      {error && (
        <div className="bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
          <XCircle className="w-5 h-5 text-red-500 flex-shrink-0" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-800">Failed to load logs</p>
            <p className="text-xs text-red-600">{error}</p>
          </div>
          <button onClick={fetchAll} className="text-xs font-semibold text-red-600 hover:text-red-800 px-3 py-1 bg-red-100 rounded-lg">Retry</button>
        </div>
      )}

      {/* Single Panel */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        {/* Search Bar */}
        <div className="p-4 border-b border-slate-100 flex items-center justify-between gap-4">
          <form onSubmit={e => { e.preventDefault(); }} className="relative w-full max-w-sm">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input
              type="text"
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Search by agent, phone, campaign..."
              className="w-full bg-slate-50 border border-slate-200 rounded-lg py-1.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-emerald-500 transition"
            />
          </form>
          <div className="text-xs text-slate-400 font-medium whitespace-nowrap">
            <span className="text-slate-900 font-bold">{filtered.length}</span> entries
          </div>
        </div>

        {loading && entries.length === 0 ? (
          <div className="p-12 text-center">
            <div className="animate-spin w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full mx-auto mb-3"></div>
            <p className="text-sm text-slate-500">Loading call logs...</p>
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-20 text-center">
            <Database className="w-12 h-12 text-slate-200 mx-auto mb-4" />
            <h3 className="text-lg font-bold text-slate-900">{search ? 'No results' : 'No logs yet'}</h3>
            <p className="text-slate-500">{search ? 'Try a different search term.' : 'Logs will appear after calls are made.'}</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left">
              <thead className="bg-slate-50 border-b border-slate-100">
                <tr>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Agent</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Details</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Status</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Duration</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Timestamp</th>
                  <th className="px-6 py-4 text-[10px] font-black uppercase text-slate-400 tracking-wider">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {filtered.map((entry) => (
                  <tr key={entry.id} className="hover:bg-slate-50/50 transition-colors">
                    {/* Agent Name */}
                    <td className="px-6 py-4">
                      <p className="text-sm font-bold text-slate-900">{entry.agentName}</p>
                      {entry.callSid && (
                        <p className="text-[10px] text-slate-400 font-mono mt-0.5">{entry.callSid.slice(0, 18)}...</p>
                      )}
                    </td>
                    {/* Phone number + Campaign */}
                    <td className="px-6 py-4">
                      {entry.phoneNumber && (
                        <p className="text-sm font-medium text-slate-800">{entry.phoneNumber}</p>
                      )}
                      {entry.campaignName && (
                        <span className="inline-flex items-center gap-1.5 mt-1 text-xs font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-2 py-0.5 rounded-lg">
                          <Megaphone className="w-3.5 h-3.5 text-amber-500" />{entry.campaignName}
                        </span>
                      )}
                    </td>
                    {/* Status */}
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        {getStatusIcon(entry.status, entry.successful)}
                        <span className="text-sm capitalize text-slate-700">{entry.status === 'done' ? 'completed' : entry.status}</span>
                      </div>
                    </td>
                    {/* Duration */}
                    <td className="px-6 py-4 text-sm font-medium text-slate-900">
                      {formatDuration(entry.duration)}
                    </td>
                    {/* Timestamp */}
                    <td className="px-6 py-4">
                      <p className="text-sm text-slate-700">{new Date(entry.timestamp).toLocaleDateString('en-IN', { timeZone: 'Asia/Kolkata' })}</p>
                      <p className="text-xs text-slate-400">{new Date(entry.timestamp).toLocaleTimeString('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', hour12: true })}</p>
                    </td>
                    {/* Actions */}
                    <td className="px-6 py-4">
                      <button
                        onClick={() => openDetail(entry)}
                        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-semibold text-emerald-600 hover:bg-emerald-50 rounded-lg transition"
                      >
                        <FileText className="w-4 h-4" />Details
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Export Field Picker Modal */}
      {showExportModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm" onClick={() => setShowExportModal(false)}>
          <div className="bg-white w-full max-w-md rounded-2xl shadow-2xl p-6 animate-in fade-in zoom-in duration-200" onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-5">
              <h2 className="text-lg font-bold text-slate-900">Export Fields</h2>
              <button onClick={() => setShowExportModal(false)} className="text-slate-400 hover:text-slate-600">
                <X className="w-5 h-5" />
              </button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Select the fields to include in the CSV export.</p>
            <div className="grid grid-cols-2 gap-2 mb-6">
              {exportFields.map(f => (
                <label key={f.key} className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl border cursor-pointer transition ${selectedExportFields.has(f.key) ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200 bg-slate-50 hover:border-slate-300'
                  }`}>
                  <input
                    type="checkbox"
                    checked={selectedExportFields.has(f.key)}
                    onChange={() => toggleExportField(f.key)}
                    className="w-4 h-4 rounded border-slate-300 text-emerald-500 focus:ring-emerald-500"
                  />
                  <span className={`text-sm font-medium ${selectedExportFields.has(f.key) ? 'text-emerald-800' : 'text-slate-600'}`}>{f.label}</span>
                </label>
              ))}
            </div>
            <div className="flex items-center justify-between">
              <p className="text-xs text-slate-400">{selectedExportFields.size} of {exportFields.length} fields selected</p>
              <div className="flex gap-3">
                <button onClick={() => setShowExportModal(false)} className="px-4 py-2 text-sm font-bold text-slate-600 hover:bg-slate-100 rounded-xl transition">Cancel</button>
                <button
                  onClick={handleExportCSV}
                  disabled={selectedExportFields.size === 0}
                  className="flex items-center gap-2 px-5 py-2 bg-emerald-500 text-white text-sm font-bold rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
                >
                  <Download className="w-4 h-4" />Export
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Detail Modal */}
      {selectedEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm" onClick={closeDetail}>
          <div className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[85vh] overflow-hidden flex flex-col" onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50">
              <div>
                <h2 className="text-lg font-bold text-slate-900">{selectedEntry.agentName}</h2>
                <div className="flex items-center gap-2 mt-1">
                  {selectedEntry.phoneNumber && (
                    <span className="text-xs text-slate-500">{selectedEntry.phoneNumber}</span>
                  )}
                  {selectedEntry.campaignName && (
                    <span className="inline-flex items-center gap-1 text-[10px] font-semibold bg-amber-50 text-amber-700 border border-amber-200 px-1.5 py-0.5 rounded">
                      <Megaphone className="w-3 h-3 text-amber-500" />{selectedEntry.campaignName}
                    </span>
                  )}
                  {selectedEntry.callSid && (
                    <span className="text-[10px] text-slate-400 font-mono">SID: {selectedEntry.callSid.slice(0, 18)}...</span>
                  )}
                </div>
              </div>
              <button onClick={closeDetail} className="p-2 hover:bg-slate-200 rounded-lg transition">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>

            {/* Content */}
            <div className="overflow-y-auto flex-1">
              {/* Meta Cards */}
              <div className="grid grid-cols-3 gap-3 px-6 py-4">
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Status</p>
                  <div className="flex items-center justify-center gap-1 mt-1">
                    {getStatusIcon(selectedEntry.status, selectedEntry.successful)}
                    <span className="text-sm font-semibold capitalize text-slate-700">
                      {selectedEntry.status === 'done' ? 'completed' : selectedEntry.status}
                    </span>
                  </div>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Duration</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">{formatDuration(convDetail?.metadata?.call_duration_secs ?? selectedEntry.duration)}</p>
                </div>
                <div className="bg-slate-50 rounded-xl p-3 text-center">
                  <p className="text-[10px] uppercase font-bold text-slate-400">Messages</p>
                  <p className="text-sm font-semibold text-slate-700 mt-1">
                    {convDetail ? convDetail.transcript.length : selectedEntry.messages || parseTwilioTranscript(selectedEntry.transcript).length} turns
                  </p>
                </div>
              </div>

              {/* Audio Player */}
              {(() => {
                const audioUrl = getAudioUrl(selectedEntry) || (convDetail?.has_audio ? api.getConversationAudioUrl(selectedEntry.conversationId!) : null);
                if (!audioUrl) return null;
                if (audioError) {
                  return (
                    <div className="mx-6 mb-4 bg-slate-50 border border-slate-200 rounded-xl p-4 flex items-center gap-3">
                      <XCircle className="w-5 h-5 text-slate-400 flex-shrink-0" />
                      <p className="text-sm text-slate-500">Recording unavailable — the audio file could not be loaded.</p>
                    </div>
                  );
                }
                return (
                  <div className="mx-6 mb-4 bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex items-center gap-4">
                    <button
                      onClick={() => toggleAudio(audioUrl)}
                      className="flex-shrink-0 w-10 h-10 bg-emerald-500 hover:bg-emerald-600 text-white rounded-full flex items-center justify-center transition"
                    >
                      {audioPlaying ? <Pause className="w-5 h-5" /> : <Play className="w-5 h-5 ml-0.5" />}
                    </button>
                    <div className="flex-1">
                      <p className="text-sm font-semibold text-emerald-800">Call Recording</p>
                      <p className="text-xs text-emerald-600">{formatDuration(convDetail?.metadata?.call_duration_secs ?? selectedEntry.duration)} recording</p>
                    </div>
                    <a href={audioUrl} download className="text-xs font-semibold text-emerald-600 hover:text-emerald-800 flex items-center gap-1">
                      <Download className="w-3.5 h-3.5" /> Download
                    </a>
                  </div>
                );
              })()}

              {/* AI Summary (from ElevenLabs) */}
              {convDetail?.analysis?.transcript_summary && (
                <div className="mx-6 mb-4 bg-blue-50 border border-blue-200 rounded-xl p-4">
                  <p className="text-[10px] uppercase font-bold text-blue-400 mb-1">AI Summary</p>
                  <p className="text-sm text-blue-800 leading-relaxed">{convDetail.analysis.transcript_summary}</p>
                </div>
              )}

              {/* Summary generating indicator */}
              {summaryGenerating && !convDetail?.analysis?.transcript_summary && (
                <div className="mx-6 mb-4 bg-amber-50 border border-amber-200 rounded-xl p-4 flex items-center gap-3">
                  <div className="animate-spin w-4 h-4 border-2 border-amber-500 border-t-transparent rounded-full flex-shrink-0"></div>
                  <div>
                    <p className="text-[10px] uppercase font-bold text-amber-500 mb-0.5">AI Summary</p>
                    <p className="text-sm text-amber-700">Generating summary... This may take a few moments for recent calls.</p>
                  </div>
                </div>
              )}

              {/* Loading indicator for ElevenLabs detail */}
              {detailLoading && (
                <div className="mx-6 mb-4 flex items-center gap-2 text-sm text-slate-400">
                  <div className="animate-spin w-4 h-4 border-2 border-emerald-500 border-t-transparent rounded-full"></div>
                  Loading conversation details...
                </div>
              )}

              {/* Error loading conversation details */}
              {detailError && (
                <div className="mx-6 mb-4 bg-red-50 border border-red-200 rounded-xl p-4 flex items-center gap-3">
                  <XCircle className="w-5 h-5 text-red-400 flex-shrink-0" />
                  <p className="text-sm text-red-700">{detailError}</p>
                </div>
              )}

              {/* Transcript */}
              <div className="px-6 pb-6">
                <p className="text-[10px] uppercase font-bold text-slate-400 mb-3">Transcript</p>
                {convDetail?.transcript && convDetail.transcript.length > 0 ? (
                  <div className="space-y-3">
                    {convDetail.transcript.map((entry, i) => (
                      <div key={i} className={`flex gap-3 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.role === 'agent' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'
                          }`}>
                          {entry.role === 'agent' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className={`flex-1 max-w-[80%] ${entry.role === 'user' ? 'text-right' : ''}`}>
                          <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${entry.role === 'agent'
                            ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                            : 'bg-emerald-500 text-white rounded-tr-sm'
                            }`}>
                            {entry.message}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 px-1">
                            {entry.role === 'agent' ? 'Agent' : 'User'} &middot; {entry.time_in_call_secs}s
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : selectedEntry.transcript ? (
                  <div className="space-y-3">
                    {parseTwilioTranscript(selectedEntry.transcript).map((entry, i) => (
                      <div key={i} className={`flex gap-3 ${entry.role === 'user' ? 'flex-row-reverse' : ''}`}>
                        <div className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center ${entry.role === 'agent' || entry.role === 'assistant' ? 'bg-emerald-100 text-emerald-600' : 'bg-slate-200 text-slate-600'
                          }`}>
                          {entry.role === 'agent' || entry.role === 'assistant' ? <Bot className="w-4 h-4" /> : <User className="w-4 h-4" />}
                        </div>
                        <div className={`flex-1 max-w-[80%] ${entry.role === 'user' ? 'text-right' : ''}`}>
                          <div className={`inline-block rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${entry.role === 'agent' || entry.role === 'assistant'
                            ? 'bg-slate-100 text-slate-800 rounded-tl-sm'
                            : 'bg-emerald-500 text-white rounded-tr-sm'
                            }`}>
                            {entry.text}
                          </div>
                          <p className="text-[10px] text-slate-400 mt-1 px-1 capitalize">{entry.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : !detailLoading ? (
                  <div className="text-center py-8">
                    <MessageSquare className="w-10 h-10 text-slate-200 mx-auto mb-2" />
                    <p className="text-sm text-slate-400">No transcript available for this call.</p>
                  </div>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default CallLogs;
