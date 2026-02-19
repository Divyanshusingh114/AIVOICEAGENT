import React, { useState, useEffect } from 'react';
import { Mic2, ChevronRight, Zap, Volume2, Plus, UserPlus, X, Mic, Trash2, Edit3, Phone, Loader2 } from 'lucide-react';
import { useBackend } from '../context/BackendContext';
import type { VoiceAgent } from '../../../shared/types';

const Agents: React.FC = () => {
  const { agents, addAgent, deleteAgent, updateAgent, initiateTestCall, callEvents } = useBackend();
  const [selectedAgent, setSelectedAgent] = useState<VoiceAgent | null>(agents[0] || null);
  const [isTesting, setIsTesting] = useState(false);
  const [testMode, setTestMode] = useState<'browser' | 'phone' | null>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [transcript, setTranscript] = useState<{ role: 'ai' | 'user', text: string }[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [showPhoneModal, setShowPhoneModal] = useState(false);
  const [phoneNumber, setPhoneNumber] = useState('');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [phoneTestSid, setPhoneTestSid] = useState<string | null>(null);
  const [phoneTestLoading, setPhoneTestLoading] = useState(false);
  const [selectedProvider, setSelectedProvider] = useState<'twilio' | 'plivo'>('twilio');

  // Form State
  const [name, setName] = useState('');
  const [elevenLabsId, setElevenLabsId] = useState('');
  const [apiKey, setApiKey] = useState('');

  useEffect(() => {
    if (!selectedAgent && agents.length > 0) setSelectedAgent(agents[0]!);
  }, [agents, selectedAgent]);

  // Listen for transcript events from phone test calls via SSE
  useEffect(() => {
    if (!phoneTestSid) return;
    const relevant = callEvents.filter(e => e.callSid === phoneTestSid && e.type === 'transcript');
    if (relevant.length > 0) {
      const latest = relevant[relevant.length - 1]!;
      if (latest.transcript) {
        setTranscript(prev => [...prev, latest.transcript!]);
      }
    }
  }, [callEvents, phoneTestSid]);

  const addLog = (msg: string) => {
    setLogs(prev => [...prev.slice(-10), `[${new Date().toLocaleTimeString()}] ${msg}`]);
  };

  const stopTesting = () => {
    setIsTesting(false);
    setTestMode(null);
    setPhoneTestSid(null);
    addLog("Session terminated.");
  };

  const startPhoneTest = async () => {
    if (!selectedAgent || !phoneNumber) return;
    setPhoneTestLoading(true);
    setShowPhoneModal(false);
    setIsTesting(true);
    setTestMode('phone');
    setTranscript([]);
    addLog(`Initiating phone call to ${phoneNumber}...`);

    try {
      const sid = await initiateTestCall(phoneNumber, selectedAgent.id, selectedProvider);
      setPhoneTestSid(sid);
      addLog(`Call initiated via ${selectedProvider}. SID: ${sid}`);
    } catch (err: any) {
      addLog(`Call failed: ${err.message}`);
      setIsTesting(false);
      setTestMode(null);
    } finally {
      setPhoneTestLoading(false);
    }
  };

  const resetForm = () => { setName(''); setElevenLabsId(''); setApiKey(''); setEditingId(null); };
  const handleOpenCreate = () => { resetForm(); setShowModal(true); };

  const handleOpenEdit = (agent: VoiceAgent) => {
    setEditingId(agent.id);
    setName(agent.name);
    setElevenLabsId(agent.elevenLabsId);
    setApiKey('');  // Don't pre-fill — server returns masked value
    setShowModal(true);
  };

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name || !elevenLabsId) return;
    try {
      const payload: any = { name, elevenLabsId };
      if (apiKey) payload.apiKey = apiKey;
      if (editingId) {
        await updateAgent(editingId, payload);
      } else {
        await addAgent({ ...payload, voiceId: '', language: 'English', vadSensitivity: 0.5, silenceTimeout: 1000 });
      }
      setShowModal(false);
      resetForm();
    } catch (err: any) {
      console.error(err);
    }
  };

  const handleDelete = async (id: string, agentName: string) => {
    if (window.confirm(`Delete agent "${agentName}"? Associated campaigns will also be removed.`)) {
      await deleteAgent(id);
      if (selectedAgent?.id === id) setSelectedAgent(null);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Voice Agents</h1>
          <p className="text-slate-500"></p>
        </div>
        <button onClick={handleOpenCreate} className="bg-slate-900 text-white px-5 py-2.5 rounded-xl text-sm font-semibold hover:bg-slate-800 transition flex items-center gap-2 shadow-lg shadow-slate-900/10">
          <Plus className="w-4 h-4" />Add New Agent
        </button>
      </div>

      {agents.length === 0 ? (
        <div className="bg-white border-2 border-dashed border-slate-200 rounded-3xl p-16 text-center">
          <div className="bg-slate-50 w-20 h-20 rounded-2xl flex items-center justify-center mx-auto mb-6">
            <UserPlus className="w-10 h-10 text-slate-300" />
          </div>
          <h2 className="text-2xl font-bold text-slate-900 mb-2">No agents defined</h2>
          <p className="text-slate-500 max-w-sm mx-auto mb-8">Define your first AI agent profile to enable voice synthesis.</p>
          <button onClick={handleOpenCreate} className="bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600 transition shadow-lg shadow-emerald-500/20">Create Agent Profile</button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8">
          <div className="lg:col-span-4 space-y-4">
            <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
              <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                <h3 className="text-xs font-black uppercase text-slate-400 tracking-wider">Configured Agents</h3>
                <span className="text-[10px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-bold">{agents.length} Total</span>
              </div>
              <div className="divide-y divide-slate-100">
                {agents.map((agent) => (
                  <div key={agent.id} className={`group w-full p-4 flex items-center gap-3 transition-all cursor-pointer ${selectedAgent?.id === agent.id ? 'bg-emerald-50/50' : 'hover:bg-slate-50'}`}
                    onClick={() => { setSelectedAgent(agent); if (isTesting) stopTesting(); }}>
                    <div className={`p-2.5 rounded-xl transition-colors ${selectedAgent?.id === agent.id ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400 group-hover:bg-slate-200'}`}>
                      <Mic2 className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`font-bold truncate ${selectedAgent?.id === agent.id ? 'text-emerald-700' : 'text-slate-900'}`}>{agent.name}</p>
                    </div>
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={(e) => { e.stopPropagation(); handleOpenEdit(agent); }} className="p-1.5 hover:bg-emerald-100 text-slate-400 hover:text-emerald-600 rounded-lg transition">
                        <Edit3 className="w-3.5 h-3.5" />
                      </button>
                      <button onClick={(e) => { e.stopPropagation(); handleDelete(agent.id, agent.name); }} className="p-1.5 hover:bg-red-100 text-slate-400 hover:text-red-600 rounded-lg transition">
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <ChevronRight className={`w-4 h-4 transition-transform ${selectedAgent?.id === agent.id ? 'translate-x-1 text-emerald-500' : 'text-slate-300'}`} />
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="lg:col-span-8 space-y-6">
            {selectedAgent ? (
              <div className="bg-white p-8 rounded-2xl border border-slate-200 shadow-sm animate-in fade-in duration-300">
                <div className="p-6 bg-slate-900 rounded-3xl text-white shadow-2xl overflow-hidden relative border border-slate-800">
                      <div className="flex items-center justify-between mb-6">
                        <div className="flex items-center gap-3">
                          <Zap className={`w-5 h-5 ${isTesting ? 'text-emerald-400 animate-pulse' : 'text-slate-400'}`} />
                          <h3 className="font-black uppercase tracking-tighter text-sm">Interactive Test Bench</h3>
                        </div>
                        {isTesting && testMode && (
                          <span className={`text-[8px] px-2 py-0.5 rounded-full font-black uppercase animate-pulse ${testMode === 'browser' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-blue-500/20 text-blue-400'
                            }`}>{testMode === 'browser' ? 'Browser' : 'Phone'}</span>
                        )}
                      </div>

                      {isTesting ? (
                        <div className="space-y-4 h-[350px] flex flex-col">
                          <div className="flex-1 overflow-y-auto space-y-3 pr-2 scrollbar-hide">
                            {transcript.length === 0 && (
                              <div className="flex flex-col justify-center items-center h-full text-slate-500 text-xs text-center space-y-3">
                                <Mic className="w-8 h-8 text-slate-700 animate-bounce" />
                                <p className="italic">{testMode === 'browser' ? 'Session active. Say something.' : 'Waiting for call to connect...'}</p>
                              </div>
                            )}
                            {transcript.map((line, idx) => line && (
                              <div key={idx} className={`flex ${line.role === 'ai' ? 'justify-start' : 'justify-end'} animate-in slide-in-from-bottom-2`}>
                                <div className={`max-w-[85%] p-3 rounded-2xl text-[11px] leading-relaxed font-medium ${line.role === 'ai' ? 'bg-slate-800 text-emerald-400 border border-slate-700' : 'bg-emerald-500 text-white'
                                  }`}>
                                  <p className="opacity-50 text-[7px] uppercase font-black mb-1">{line.role === 'ai' ? selectedAgent.name : 'Human'}</p>
                                  {line.text}
                                </div>
                              </div>
                            ))}
                          </div>
                          <div className="h-16 bg-black/40 rounded-xl p-3 font-mono text-[8px] overflow-y-auto border border-slate-800/50">
                            {logs.map((log, i) => <div key={i} className="text-slate-500 border-b border-slate-800/30 pb-0.5 mb-0.5">{log}</div>)}
                          </div>
                          <button onClick={stopTesting} className="w-full py-2.5 bg-red-500/20 text-red-500 rounded-xl text-xs font-bold hover:bg-red-500 hover:text-white transition-all active:scale-95 border border-red-500/30">
                            Terminate Session
                          </button>
                        </div>
                      ) : (
                        <div className="h-[350px] flex flex-col items-center justify-center text-center space-y-6">
                          <div className="p-4 bg-slate-800 rounded-full ring-8 ring-slate-800/50">
                            <Volume2 className="w-10 h-10 text-slate-500" />
                          </div>
                          <div>
                            <p className="text-sm font-bold text-slate-300">Sandbox Idle</p>
                            <p className="text-xs text-slate-500 mt-1 max-w-[220px] mx-auto">Test this agent using your browser mic or a real phone call.</p>
                          </div>
                          <button onClick={() => setShowPhoneModal(true)}
                            className="bg-blue-500 text-white px-6 py-3 rounded-2xl font-black shadow-xl shadow-blue-500/30 hover:scale-105 active:scale-95 transition-all flex items-center gap-2 text-sm">
                            <Phone className="w-4 h-4" />Phone Test
                          </button>
                        </div>
                      )}
                </div>
              </div>
            ) : (
              <div className="bg-slate-100/50 border-2 border-dashed border-slate-200 rounded-[2.5rem] p-20 text-center flex flex-col items-center justify-center">
                <Mic2 className="w-16 h-16 text-slate-300 mb-4" />
                <h2 className="text-xl font-bold text-slate-900">Select an agent profile</h2>
                <p className="text-slate-500 text-sm max-w-xs mt-2">Pick an agent from the list on the left to view configuration or start a test session.</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Agent Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-md rounded-[2rem] shadow-2xl p-8 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-8">
              <h2 className="text-2xl font-bold text-slate-900">{editingId ? 'Edit Agent Profile' : 'New Voice Agent'}</h2>
              <button onClick={() => setShowModal(false)} className="text-slate-400 hover:text-slate-600 transition p-2 hover:bg-slate-50 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <form onSubmit={handleSave} className="space-y-5">
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Friendly Name</label>
                <input required value={name} onChange={e => setName(e.target.value)} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition font-medium" placeholder="e.g. Maya Support" />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ElevenLabs Agent ID</label>
                <input required value={elevenLabsId} onChange={e => setElevenLabsId(e.target.value)} type="text" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition font-mono text-sm" placeholder="agent_6601kh0s..." />
              </div>
              <div>
                <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5 ml-1">ElevenLabs API Key <span className="normal-case font-medium text-slate-300">(optional — overrides .env default)</span></label>
                <input value={apiKey} onChange={e => setApiKey(e.target.value)} type="password" className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-emerald-500 transition font-mono text-sm" placeholder={editingId ? 'Leave blank to keep current key' : 'sk_...'} />
              </div>
              <div className="flex gap-4 pt-6">
                <button type="button" onClick={() => setShowModal(false)} className="flex-1 py-3 text-slate-400 font-bold hover:bg-slate-50 rounded-2xl transition">Cancel</button>
                <button type="submit" className="flex-1 py-3 bg-emerald-500 text-white font-black rounded-2xl shadow-xl shadow-emerald-500/20 hover:bg-emerald-600 transition">
                  {editingId ? 'Save Profile' : 'Create Agent'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Phone Test Modal */}
      {showPhoneModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm">
          <div className="bg-white w-full max-w-sm rounded-2xl shadow-2xl p-8 animate-in zoom-in duration-200">
            <div className="flex items-center justify-between mb-6">
              <h2 className="text-xl font-bold text-slate-900">Phone Call Test</h2>
              <button onClick={() => setShowPhoneModal(false)} className="text-slate-400 hover:text-slate-600 p-2 rounded-full"><X className="w-5 h-5" /></button>
            </div>
            <p className="text-sm text-slate-500 mb-4">Enter the phone number to call. The AI agent will handle the conversation via Twilio.</p>
            <input
              value={phoneNumber}
              onChange={e => setPhoneNumber(e.target.value)}
              type="tel"
              className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-3 outline-none focus:ring-2 focus:ring-blue-500 transition font-mono mb-4"
              placeholder="+14155551234"
            />

            <div className="mb-6">
              <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3 ml-1">Select Provider</label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => setSelectedProvider('twilio')}
                  className={`py-3 rounded-xl text-xs font-bold border transition-all ${selectedProvider === 'twilio'
                      ? 'bg-red-50 border-red-200 text-red-600 ring-2 ring-red-500/20'
                      : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                    }`}
                >
                  Twilio
                </button>
                <button
                  type="button"
                  onClick={() => setSelectedProvider('plivo')}
                  className={`py-3 rounded-xl text-xs font-bold border transition-all ${selectedProvider === 'plivo'
                      ? 'bg-blue-50 border-blue-200 text-blue-600 ring-2 ring-blue-500/20'
                      : 'bg-white border-slate-200 text-slate-400 hover:bg-slate-50'
                    }`}
                >
                  Plivo
                </button>
              </div>
            </div>
            <div className="flex gap-3">
              <button type="button" onClick={() => setShowPhoneModal(false)} className="flex-1 py-3 text-slate-400 font-bold hover:bg-slate-50 rounded-xl transition">Cancel</button>
              <button onClick={startPhoneTest} disabled={!phoneNumber || phoneTestLoading}
                className="flex-1 py-3 bg-blue-500 text-white font-black rounded-xl shadow-lg hover:bg-blue-600 transition disabled:opacity-50 flex items-center justify-center gap-2">
                {phoneTestLoading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Phone className="w-4 h-4" />}
                Call Now
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default Agents;
