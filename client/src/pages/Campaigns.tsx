import React, { useState, useRef, useEffect } from 'react';
import { Plus, Play, Pause, Square, Trash2, Edit3, ShieldAlert, CheckCircle2, MegaphoneOff, X, Loader2, Upload, FileText, AlertTriangle, Clock, CalendarClock } from 'lucide-react';
import { useBackend } from '../context/BackendContext';
import { api } from '../services/api';
import * as XLSX from 'xlsx';

const Campaigns: React.FC = () => {
  const { campaigns, agents, isProviderReady, addCampaign, startCampaign, pauseCampaign, stopCampaign, deleteCampaign, updateCampaign, scheduleCampaign, cancelSchedule } = useBackend();
  const [showModal, setShowModal] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Form State
  const [name, setName] = useState('');
  const [agentId, setAgentId] = useState('');
  const [provider, setProvider] = useState<'twilio' | 'plivo' | 'asterisk'>('twilio');
  const [fromNumber, setFromNumber] = useState('');
  const [phoneListText, setPhoneListText] = useState('');

  const [scheduleEnabled, setScheduleEnabled] = useState(false);
  const [scheduledAt, setScheduledAt] = useState('');

  const [csvError, setCsvError] = useState<string | null>(null);
  const [csvFileName, setCsvFileName] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Auto-fill Caller ID based on provider when creating new campaign
  useEffect(() => {
    if (!editingId && showModal) {
      api.getSettings().then(settings => {
        if (provider === 'twilio') setFromNumber(settings.twilioPhoneNumber || '');
        else if (provider === 'plivo') setFromNumber(settings.plivoPhoneNumber || '');
        else setFromNumber('');
      });
    }
  }, [provider, editingId, showModal]);

  const resetForm = () => {
    setName('');
    setAgentId('');
    setProvider('twilio');
    setFromNumber(''); // This will be sync'd to provider's default in useEffect or manual selection
    setPhoneListText('');
    setEditingId(null);
    setScheduleEnabled(false);
    setScheduledAt('');
    setCsvError(null);
    setCsvFileName(null);
  };

  const handleOpenCreate = () => { resetForm(); setShowModal(true); };

  const handleOpenEdit = (campaign: any) => {
    setEditingId(campaign.id);
    setName(campaign.name);
    setAgentId(campaign.agentId);
    setProvider(campaign.provider);
    setFromNumber(campaign.fromNumber);
    const phones = campaign.phoneList || [];
    setPhoneListText(phones.join('\n'));
    setCsvFileName(phones.length > 0 ? 'Existing phone list' : null);
    setCsvError(null);
    if (campaign.scheduledAt) {
      setScheduleEnabled(true);
      // Convert UTC ISO to local datetime-local format
      const local = new Date(campaign.scheduledAt);
      const pad = (n: number) => String(n).padStart(2, '0');
      setScheduledAt(`${local.getFullYear()}-${pad(local.getMonth() + 1)}-${pad(local.getDate())}T${pad(local.getHours())}:${pad(local.getMinutes())}`);
    } else {
      setScheduleEnabled(false);
      setScheduledAt('');
    }
    setShowModal(true);
  };

  const parsePhoneList = (text: string): string[] => {
    return text.split(/[\n,;]+/).map(s => s.trim()).filter(s => s.length > 0);
  };

  // Phone number validation: must start with + and have 7-15 digits
  const isValidPhone = (phone: string): boolean => /^\+\d{7,15}$/.test(phone.replace(/[\s\-()]/g, ''));

  const handleCsvUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    setCsvError(null);
    setCsvFileName(null);
    const file = e.target.files?.[0];
    if (!file) return;

    if (!file.name.match(/\.(csv|xlsx|xls)$/)) {
      setCsvError('Please upload a .csv or Excel file');
      return;
    }

    const reader = new FileReader();

    reader.onload = (evt) => {
      /* parse data */
      const bstr = evt.target?.result;
      const wb = XLSX.read(bstr, { type: 'array' });
      /* grab first sheet */
      const wsname = wb.SheetNames[0];
      const ws = wb.Sheets[wsname];
      /* convert to array of objects */
      const data = XLSX.utils.sheet_to_json<string[]>(ws, { header: 1 });

      if (!data || data.length === 0) {
        setCsvError('File is empty');
        return;
      }

      const lines = data;
      if (lines.length < 2) {
        setCsvError('File must have a header row and at least one data row');
        return;
      }

      // Parse header to find the phone column
      const header = (lines[0] || []).map((h: any) => String(h).trim().toLowerCase().replace(/['"]/g, ''));
      const phoneColIndex = header.findIndex(h =>
        ['phone', 'phone_number', 'phonenumber', 'mobile', 'number', 'contact'].includes(h)
      );

      if (phoneColIndex === -1) {
        setCsvError('File must have a column named "phone", "phone_number", "mobile", "number", or "contact"');
        return;
      }

      const phones: string[] = [];
      const errors: string[] = [];

      for (let i = 1; i < lines.length; i++) {
        const row = lines[i] as any[];
        if (!row || row.length === 0) continue;

        const raw = row[phoneColIndex];
        if (!raw) continue;

        // Normalize: strip spaces/dashes/parens
        const cleaned = String(raw).replace(/[\s\-()]/g, '');
        if (isValidPhone(cleaned)) {
          phones.push(cleaned);
        } else {
          // If it looks like a number but missing +, try adding it if length is reasonable
          const withPlus = '+' + cleaned;
          if (isValidPhone(withPlus)) {
            phones.push(withPlus);
          } else {
            errors.push(`Row ${i + 1}: "${raw}" is not a valid phone number (must start with + and country code)`);
          }
        }
      }

      if (phones.length === 0) {
        setCsvError(`No valid phone numbers found. ${errors.length > 0 ? errors.slice(0, 3).join('; ') : ''}`);
        return;
      }

      // Deduplicate
      const unique = [...new Set(phones)];
      const dupes = phones.length - unique.length;

      setCsvFileName(file.name);
      setPhoneListText(unique.join('\n'));

      if (errors.length > 0 || dupes > 0) {
        const warnings: string[] = [];
        if (errors.length > 0) warnings.push(`${errors.length} invalid number${errors.length > 1 ? 's' : ''} skipped`);
        if (dupes > 0) warnings.push(`${dupes} duplicate${dupes > 1 ? 's' : ''} removed`);
        setCsvError(`Imported ${unique.length} numbers. ${warnings.join(', ')}.`);
      } else {
        setCsvError(null);
      }
    };
    reader.readAsArrayBuffer(file);

    // Reset file input so same file can be re-uploaded
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !agentId || !fromNumber) return;
    setLoading(true);

    try {
      const phoneList = parsePhoneList(phoneListText);
      const scheduleIso = scheduleEnabled && scheduledAt ? new Date(scheduledAt).toISOString() : null;
      if (editingId) {
        await updateCampaign(editingId, { name, agentId, provider, fromNumber, recordingEnabled: true, phoneList, scheduledAt: scheduleIso });
      } else {
        await addCampaign({ name, agentId, provider, fromNumber, recordingEnabled: true, phoneList, scheduledAt: scheduleIso });
      }
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string, name: string) => {
    if (window.confirm(`Are you sure you want to delete campaign "${name}"?`)) {
      try { await deleteCampaign(id); } catch (err: any) { setError(err.message); }
    }
  };

  const toggleStatus = async (id: string, newStatus: 'active' | 'paused' | 'stopped') => {
    try {
      if (newStatus === 'active') await startCampaign(id);
      else if (newStatus === 'paused') await pauseCampaign(id);
      else await stopCampaign(id);
    } catch (err: any) {
      setError(err.message);
      setTimeout(() => setError(null), 5000);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Campaign Orchestration</h1>
          <p className="text-slate-500">Manage outbound voice AI campaigns with real Twilio calls</p>
        </div>
        <button onClick={handleOpenCreate} className="flex items-center gap-2 bg-emerald-500 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition">
          <Plus className="w-5 h-5" />Create New Campaign
        </button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-2xl flex gap-3 text-red-700 animate-in slide-in-from-top-2">
          <ShieldAlert className="w-5 h-5" /><span className="font-bold text-sm">{error}</span>
        </div>
      )}

      {campaigns.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
          <div className="bg-slate-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <MegaphoneOff className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No campaigns found</h2>
          <p className="text-slate-500 max-w-sm mx-auto mb-8">Click the button above to launch your first voice outreach campaign.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {campaigns.map((campaign) => {
            const phoneCount = (campaign.phoneList || []).length;
            const progress = phoneCount > 0 ? Math.round((campaign.callCount / phoneCount) * 100) : 0;
            const failedCalls = campaign.callCount - campaign.successfulCalls;

            return (
              <div key={campaign.id} className="bg-white p-5 rounded-2xl border border-slate-200 shadow-sm flex flex-col md:flex-row items-center gap-6 group hover:border-emerald-200 transition">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-1">
                    <h3 className="text-lg font-bold text-slate-900 truncate">{campaign.name}</h3>
                    <span className={`text-[10px] uppercase font-black px-2 py-0.5 rounded flex items-center gap-1 ${campaign.provider === 'twilio' ? 'bg-red-100 text-red-600' : 'bg-blue-100 text-blue-600'
                      }`}>
                      {campaign.provider}
                      <CheckCircle2 className="w-2.5 h-2.5" />
                    </span>
                    {campaign.status === 'active' && <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-ping"></span>}
                    {campaign.status === 'scheduled' && <span className="flex h-2 w-2 rounded-full bg-blue-500 animate-pulse"></span>}
                  </div>
                  <div className="flex items-center gap-4 text-sm text-slate-500">
                    <span>From: {campaign.fromNumber}</span>
                    <span>Status: <span className={`capitalize font-bold ${campaign.status === 'scheduled' ? 'text-blue-600' : 'text-slate-700'}`}>{campaign.status}</span></span>
                    <span>{phoneCount} numbers</span>
                  </div>
                  {campaign.status === 'scheduled' && campaign.scheduledAt && (
                    <div className="flex items-center gap-1.5 mt-1 text-xs text-blue-600 font-semibold">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Scheduled: {new Date(campaign.scheduledAt).toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', dateStyle: 'medium', timeStyle: 'short' })} IST</span>
                    </div>
                  )}
                  {campaign.status === 'active' && phoneCount > 0 && (
                    <div className="mt-2 flex items-center gap-3">
                      <div className="flex-1 h-2 bg-slate-100 rounded-full overflow-hidden max-w-[200px]">
                        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${Math.min(progress, 100)}%` }}></div>
                      </div>
                      <span className="text-xs font-bold text-slate-500">{campaign.callCount}/{phoneCount}</span>
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-8 w-full md:w-auto px-6 border-l border-r border-slate-100">
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">Total</p>
                    <p className="text-lg font-bold text-slate-900">{campaign.callCount}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">Completed</p>
                    <p className="text-lg font-bold text-emerald-600">{campaign.successfulCalls}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-xs text-slate-400 font-bold uppercase mb-1">Failed</p>
                    <p className="text-lg font-bold text-red-500">{failedCalls}</p>
                  </div>
                </div>

                <div className="flex items-center gap-2">
                  {campaign.status === 'scheduled' ? (
                    <button onClick={async () => { try { await cancelSchedule(campaign.id); } catch (err: any) { setError(err.message); setTimeout(() => setError(null), 5000); } }}
                      className="p-2 text-blue-500 hover:bg-blue-50 rounded-lg transition" title="Cancel Schedule">
                      <X className="w-6 h-6" />
                    </button>
                  ) : campaign.status === 'active' ? (
                    <button onClick={() => toggleStatus(campaign.id, 'paused')} className="p-2 text-amber-500 hover:bg-amber-50 rounded-lg transition" title="Pause">
                      <Pause className="w-6 h-6 fill-current" />
                    </button>
                  ) : (
                    <button onClick={() => toggleStatus(campaign.id, 'active')} className="p-2 text-emerald-500 hover:bg-emerald-50 rounded-lg transition" title="Start">
                      <Play className="w-6 h-6 fill-current" />
                    </button>
                  )}
                  {campaign.status !== 'scheduled' && (
                    <button onClick={() => toggleStatus(campaign.id, 'stopped')} className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-50 rounded-lg transition" title="Stop">
                      <Square className="w-6 h-6 fill-current" />
                    </button>
                  )}
                  <div className="w-px h-8 bg-slate-100 mx-2"></div>
                  <button onClick={() => handleOpenEdit(campaign)} className="p-2 text-slate-400 hover:text-emerald-500 hover:bg-emerald-50 rounded-lg transition">
                    <Edit3 className="w-5 h-5" />
                  </button>
                  <button onClick={() => handleDelete(campaign.id, campaign.name)} className="p-2 text-slate-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition">
                    <Trash2 className="w-5 h-5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm">
          <div className="bg-white w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl shadow-2xl p-8 animate-in fade-in zoom-in duration-200">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-2xl font-bold text-slate-900">{editingId ? 'Edit Campaign' : 'Configure Campaign'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSubmit} className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Campaign Name</label>
                  <input type="text" required value={name} onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition" placeholder="e.g. Sales Outreach" />
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Voice Agent</label>
                  <select required value={agentId} onChange={e => setAgentId(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-emerald-500 transition">
                    <option value="">Select Agent...</option>
                    {agents.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">Call Provider</label>
                  <div className="grid grid-cols-3 gap-2">
                    <button type="button" onClick={() => setProvider('twilio')}
                      className={`py-2.5 border-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition ${provider === 'twilio' ? 'border-emerald-500 text-emerald-600 bg-emerald-50' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>Twilio</button>
                    <button type="button" onClick={() => setProvider('plivo')}
                      className={`py-2.5 border-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition ${provider === 'plivo' ? 'border-blue-500 text-blue-600 bg-blue-50' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>Plivo</button>
                    <button type="button" onClick={() => setProvider('asterisk')}
                      className={`py-2.5 border-2 rounded-xl font-bold text-[11px] uppercase tracking-wider transition ${provider === 'asterisk' ? 'border-indigo-500 text-indigo-600 bg-indigo-50' : 'border-slate-100 text-slate-400 bg-slate-50'}`}>Asterisk</button>
                  </div>
                </div>
                <div>
                  <label className="block text-sm font-bold text-slate-700 mb-2">
                    {provider === 'twilio' ? 'Twilio Verified Number' : provider === 'plivo' ? 'Plivo Caller ID' : 'Caller ID'}
                  </label>
                  <input type="text" required value={fromNumber} onChange={e => setFromNumber(e.target.value)}
                    className={`w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 transition ${provider === 'twilio' ? 'focus:ring-emerald-500' : provider === 'plivo' ? 'focus:ring-blue-500' : 'focus:ring-indigo-500'
                      }`} placeholder="+1 (555) 000-0000" />
                  <p className="text-[10px] text-slate-400 mt-1 font-medium">This number must be verified/purchased in your {provider} account.</p>
                </div>
              </div>

              <div>
                <label className="block text-sm font-bold text-slate-700 mb-2">Phone Numbers (CSV/Excel Upload)</label>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv,.xlsx,.xls"
                  onChange={handleCsvUpload}
                  className="hidden"
                />

                {/* Upload area */}
                {!csvFileName ? (
                  <div
                    onClick={() => fileInputRef.current?.click()}
                    className="border-2 border-dashed border-slate-200 rounded-xl p-6 text-center cursor-pointer hover:border-emerald-400 hover:bg-emerald-50/30 transition group"
                  >
                    <Upload className="w-8 h-8 text-slate-300 group-hover:text-emerald-500 mx-auto mb-2 transition" />
                    <p className="text-sm font-semibold text-slate-600">Click to upload CSV or Excel file</p>
                    <p className="text-xs text-slate-400 mt-1">Required column: <span className="font-bold">phone</span> (also accepts: phone_number, mobile, number, contact)</p>
                  </div>
                ) : (
                  <div className="flex items-center gap-3 px-4 py-3 bg-emerald-50 border border-emerald-200 rounded-xl">
                    <FileText className="w-5 h-5 text-emerald-500" />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-emerald-800 truncate">{csvFileName}</p>
                      <p className="text-xs text-emerald-600">{parsePhoneList(phoneListText).length} numbers loaded</p>
                    </div>
                    <button type="button" onClick={() => { setPhoneListText(''); setCsvFileName(null); setCsvError(null); }}
                      className="text-emerald-400 hover:text-emerald-700 p-1"><X className="w-4 h-4" /></button>
                  </div>
                )}

                {/* CSV validation warning */}
                {csvError && (
                  <div className="flex items-start gap-2 mt-2 px-3 py-2 bg-amber-50 border border-amber-200 rounded-lg">
                    <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-amber-700">{csvError}</span>
                  </div>
                )}

              </div>

              <div className="flex items-center gap-3 p-4 bg-slate-50 rounded-2xl border border-slate-200">
                <CalendarClock className={`w-6 h-6 ${scheduleEnabled ? 'text-blue-500' : 'text-slate-300'}`} />
                <div className="flex-1">
                  <p className="text-sm font-bold text-slate-900">Schedule Campaign</p>
                  <p className="text-xs text-slate-500">Auto-start at a specific date and time.</p>
                </div>
                <button type="button" onClick={() => setScheduleEnabled(!scheduleEnabled)}
                  className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${scheduleEnabled ? 'bg-blue-500' : 'bg-slate-300'}`}>
                  <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${scheduleEnabled ? 'translate-x-6' : 'translate-x-1'}`} />
                </button>
              </div>
              {scheduleEnabled && (
                <div className="px-4">
                  <label className="block text-sm font-bold text-slate-700 mb-2">Scheduled Date & Time</label>
                  <input
                    type="datetime-local"
                    required
                    value={scheduledAt}
                    onChange={e => setScheduledAt(e.target.value)}
                    min={new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16)}
                    className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition"
                  />
                </div>
              )}

              <div className="flex gap-4 pt-4">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-600 font-bold hover:bg-slate-100 rounded-xl transition">Cancel</button>
                <button type="submit" disabled={agents.length === 0 || loading}
                  className="flex-1 py-3 bg-emerald-500 text-white font-bold rounded-xl hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50 flex items-center justify-center gap-2">
                  {loading && <Loader2 className="w-4 h-4 animate-spin" />}
                  {editingId ? 'Save Changes' : 'Create Campaign'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default Campaigns;
