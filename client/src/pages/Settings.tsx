import React, { useState, useEffect } from 'react';
import { Shield, Phone, Server, CheckCircle2, Save, Loader2, Zap } from 'lucide-react';
import { api } from '../services/api';

const Settings: React.FC = () => {
  const [formData, setFormData] = useState({
    twilioAccountSid: '',
    twilioAuthToken: '',
    twilioPhoneNumber: '',
    plivoAuthId: '',
    plivoAuthToken: '',
    plivoPhoneNumber: '',
    asteriskSipHost: '',
    asteriskSipUser: '',
    asteriskSipPass: '',
  });
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [twilioTest, setTwilioTest] = useState<{ loading: boolean; result: string | null }>({ loading: false, result: null });
  const [plivoTest, setPlivoTest] = useState<{ loading: boolean; result: string | null }>({ loading: false, result: null });
  useEffect(() => {
    api.getSettings().then(settings => {
      setFormData(prev => ({ ...prev, ...settings }));
    }).catch(() => { });
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.saveSettings(formData);
      setSaved(true);
      setTimeout(() => setSaved(false), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleTestTwilio = async () => {
    setTwilioTest({ loading: true, result: null });
    try {
      const result = await api.testTwilio();
      setTwilioTest({ loading: false, result: result.message });
    } catch (err: any) {
      setTwilioTest({ loading: false, result: err.message });
    }
  };

  const handleTestPlivo = async () => {
    setPlivoTest({ loading: true, result: null });
    try {
      const result = await api.testPlivo({
        plivoAuthId: formData.plivoAuthId,
        plivoAuthToken: formData.plivoAuthToken
      });
      setPlivoTest({ loading: false, result: result.message });
    } catch (err: any) {
      setPlivoTest({ loading: false, result: err.message });
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">System Configuration</h1>
          <p className="text-slate-500">Securely manage your VoIP & AI credentials</p>
        </div>
      </div>

      {saved && (
        <div className="bg-emerald-50 border border-emerald-200 p-4 rounded-2xl flex items-center gap-3 text-emerald-700 font-bold animate-in slide-in-from-top-2">
          <CheckCircle2 className="w-5 h-5" />
          Configuration saved successfully!
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-6">
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-500 text-white rounded-lg">
                <Phone className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Twilio Integration</h2>
            </div>
            <button
              type="button"
              onClick={handleTestTwilio}
              disabled={twilioTest.loading}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
            >
              {twilioTest.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Connection
            </button>
          </div>
          {twilioTest.result && (
            <div className="mb-4 p-3 bg-slate-50 rounded-xl text-sm text-slate-600">{twilioTest.result}</div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Account SID</label>
              <input
                type="text"
                value={formData.twilioAccountSid}
                onChange={e => setFormData({ ...formData, twilioAccountSid: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition font-mono"
                placeholder="Server .env is used for calls"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Auth Token</label>
              <input
                type="password"
                value={formData.twilioAuthToken}
                onChange={e => setFormData({ ...formData, twilioAuthToken: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Verified Outbound Number</label>
              <input
                type="text"
                value={formData.twilioPhoneNumber}
                onChange={e => setFormData({ ...formData, twilioPhoneNumber: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-red-500 transition"
                placeholder="+15551234567"
              />
            </div>
          </div>
        </div>
        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-600 text-white rounded-lg">
                <Phone className="w-5 h-5" />
              </div>
              <h2 className="text-lg font-bold text-slate-900">Plivo Integration</h2>
            </div>
            <button
              type="button"
              onClick={handleTestPlivo}
              disabled={plivoTest.loading}
              className="flex items-center gap-2 text-sm font-bold px-4 py-2 bg-slate-50 text-slate-600 rounded-lg hover:bg-slate-100 transition disabled:opacity-50"
            >
              {plivoTest.loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Zap className="w-4 h-4" />}
              Test Connection
            </button>
          </div>
          {plivoTest.result && (
            <div className={`mb-4 p-3 rounded-xl text-sm ${plivoTest.result.includes('Connected') ? 'bg-emerald-50 text-emerald-600' : 'bg-red-50 text-red-600'}`}>
              {plivoTest.result}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">Auth ID</label>
              <input
                type="text"
                value={formData.plivoAuthId}
                onChange={e => setFormData({ ...formData, plivoAuthId: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-600 transition font-mono"
                placeholder="Plivo Auth ID"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Auth Token</label>
              <input
                type="password"
                value={formData.plivoAuthToken}
                onChange={e => setFormData({ ...formData, plivoAuthToken: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-600 transition font-mono"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">Plivo Number</label>
              <input
                type="text"
                value={formData.plivoPhoneNumber}
                onChange={e => setFormData({ ...formData, plivoPhoneNumber: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-600 transition"
                placeholder="+15551234567"
              />
            </div>
          </div>
        </div>

        <div className="bg-white p-6 rounded-2xl border border-slate-200 shadow-sm">
          <div className="flex items-center gap-3 mb-6">
            <div className="p-2 bg-blue-500 text-white rounded-lg">
              <Server className="w-5 h-5" />
            </div>
            <h2 className="text-lg font-bold text-slate-900">Asterisk SIP Node</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="md:col-span-2">
              <label className="block text-sm font-bold text-slate-700 mb-2">SIP Host (IP/Domain)</label>
              <input
                type="text"
                value={formData.asteriskSipHost}
                onChange={e => setFormData({ ...formData, asteriskSipHost: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition"
                placeholder="sip.voice.local"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">SIP User</label>
              <input
                type="text"
                value={formData.asteriskSipUser}
                onChange={e => setFormData({ ...formData, asteriskSipUser: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-2">SIP Password</label>
              <input
                type="password"
                value={formData.asteriskSipPass}
                onChange={e => setFormData({ ...formData, asteriskSipPass: e.target.value })}
                className="w-full bg-slate-50 border border-slate-200 rounded-xl px-4 py-2.5 outline-none focus:ring-2 focus:ring-blue-500 transition font-mono"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between p-6 bg-slate-900 rounded-2xl shadow-xl shadow-slate-900/10">
          <div className="flex items-center gap-3 text-slate-400">
            <Shield className="w-6 h-6" />
            <p className="text-sm">Settings are saved to the backend database. API keys in server .env are used for Twilio & ElevenLabs calls.</p>
          </div>
          <button
            type="submit"
            disabled={saving}
            className="flex items-center gap-2 bg-emerald-500 text-white px-8 py-3 rounded-xl font-bold hover:bg-emerald-600 shadow-lg shadow-emerald-500/20 transition disabled:opacity-50"
          >
            {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : <Save className="w-5 h-5" />}
            Save Config
          </button>
        </div>
      </form>
    </div>
  );
};

export default Settings;
