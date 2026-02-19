import React, { useState, useEffect, useCallback } from 'react';
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';
import {
  Phone, CheckCircle2, Activity, Clock, TrendingUp,
  BarChart3, ListOrdered, Zap, PhoneOff, RefreshCw
} from 'lucide-react';
import { useBackend } from '../context/BackendContext';
import { api } from '../services/api';
import type { ActiveCall } from '../../../shared/types';

const LiveCallCard: React.FC<{ call: ActiveCall }> = ({ call }) => {
  const [duration, setDuration] = useState(0);

  useEffect(() => {
    setDuration(Math.floor((Date.now() - call.startTime) / 1000));
    const interval = setInterval(() => {
      setDuration(Math.floor((Date.now() - call.startTime) / 1000));
    }, 1000);
    return () => clearInterval(interval);
  }, [call.startTime]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="flex items-center justify-between p-4 bg-slate-50 border border-slate-200 rounded-2xl hover:bg-white hover:shadow-md transition-all group">
      <div className="flex items-center gap-3">
        <div className="relative">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 flex items-center justify-center text-emerald-600">
            <Phone className="w-5 h-5" />
          </div>
          <div className="absolute -top-1 -right-1 w-3 h-3 bg-emerald-500 rounded-full border-2 border-white animate-pulse" />
        </div>
        <div>
          <p className="text-sm font-black text-slate-900">{call.phoneNumber}</p>
          <div className="flex items-center gap-1.5">
            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">SID: {call.sid?.substring(0, 8)}...</span>
          </div>
        </div>
      </div>
      <div className="text-right">
        <p className="text-lg font-black text-emerald-600 font-mono">{formatTime(Math.max(0, duration))}</p>
        <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Active Now</p>
      </div>
    </div>
  );
};


const Dashboard: React.FC = () => {
  const { activeCalls, logs, refreshData } = useBackend();
  const [dashData, setDashData] = useState<any>(null);

  const fetchDashboard = useCallback(() => {
    api.getDashboard().then(setDashData).catch(() => { });
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [logs, activeCalls, fetchDashboard]);

  useEffect(() => {
    const interval = setInterval(fetchDashboard, 15_000);
    return () => clearInterval(interval);
  }, [fetchDashboard]);

  const totalCalls = dashData?.totalCalls ?? 0;
  const totalConnected = dashData?.totalConnected ?? 0;
  const totalFailed = totalCalls - totalConnected;
  const avgDurationSeconds = dashData?.avgDuration ?? 0;
  const activeCallsCount = Math.max(dashData?.activeCalls ?? 0, activeCalls.length);

  const formatDuration = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = seconds % 60;
    return `${m}m ${s}s`;
  };

  const stats = [
    { label: 'Total Calls Made', value: totalCalls.toLocaleString(), icon: Phone, color: 'text-blue-600', bg: 'bg-blue-50', border: 'border-blue-100' },
    { label: 'Calls Connected', value: totalConnected.toLocaleString(), icon: CheckCircle2, color: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-100' },
    { label: 'Active Calls', value: activeCallsCount.toString(), icon: Activity, color: 'text-indigo-600', bg: 'bg-indigo-50', border: 'border-indigo-100', live: activeCallsCount > 0 },
    { label: 'Avg Call Duration', value: formatDuration(avgDurationSeconds), icon: Clock, color: 'text-amber-600', bg: 'bg-amber-50', border: 'border-amber-100' },
  ];

  const conversionData = totalCalls > 0 ? [
    { name: 'Success', value: totalConnected, color: '#10b981' },
    { name: 'Failed', value: totalFailed, color: '#ef4444' },
  ] : [];

  const chartData = dashData?.chartData ?? [];
  const recentCalls = dashData?.recentCalls ?? [];

  const formatTimestamp = (ts: string) => {
    const d = new Date(ts);
    return d.toLocaleString('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });
  };

  const statusBadge = (status: string) => {
    const map: Record<string, string> = {
      completed: 'bg-emerald-50 text-emerald-600 border-emerald-100',
      failed: 'bg-red-50 text-red-600 border-red-100',
      'no-answer': 'bg-amber-50 text-amber-600 border-amber-100',
      busy: 'bg-orange-50 text-orange-600 border-orange-100',
      initiated: 'bg-blue-50 text-blue-600 border-blue-100',
      ringing: 'bg-indigo-50 text-indigo-600 border-indigo-100',
    };
    return map[status] || 'bg-slate-50 text-slate-600 border-slate-100';
  };

  return (
    <div className="space-y-8 pb-12">
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">Performance Command</h1>
          <p className="text-slate-500 font-medium">Real-time intelligence from your voice AI infrastructure</p>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { fetchDashboard(); refreshData(); }} className="p-2 hover:bg-white rounded-xl transition text-slate-400">
            <RefreshCw className="w-5 h-5" />
          </button>
          <div className="flex items-center gap-2 px-4 py-2 bg-slate-900 text-white rounded-2xl shadow-xl shadow-slate-900/20">
            <Zap className="w-4 h-4 text-emerald-400 fill-current" />
            <span className="text-xs font-bold uppercase tracking-widest">Live Node Active</span>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
        {stats.map((stat, i) => (
          <div key={i} className={`relative overflow-hidden bg-white p-6 rounded-3xl border ${stat.border} shadow-sm group hover:shadow-md transition-all`}>
            <div className="flex justify-between items-start mb-6">
              <div className={`p-4 rounded-2xl ${stat.bg} ${stat.color} group-hover:scale-110 transition-transform`}>
                <stat.icon className="w-7 h-7" />
              </div>
              {stat.live && (
                <span className="flex items-center gap-1.5 px-2 py-1 rounded-full bg-red-100 text-red-600 text-[10px] font-black uppercase animate-pulse">
                  <span className="w-1.5 h-1.5 rounded-full bg-red-500"></span>Live
                </span>
              )}
            </div>
            <div>
              <h3 className="text-slate-400 text-xs font-bold uppercase tracking-wider">{stat.label}</h3>
              <p className="text-3xl font-black text-slate-900 mt-1">{stat.value}</p>
            </div>
            <div className="absolute -right-4 -bottom-4 w-24 h-24 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
              <stat.icon className="w-full h-full" />
            </div>
          </div>
        ))}
      </div>

      {/* Live Calls */}
      {activeCalls.length > 0 && (
        <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm animate-in fade-in slide-in-from-bottom-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <Activity className="w-5 h-5 text-emerald-500" />Live Conversations
              </h2>
              <p className="text-xs text-slate-400 font-medium">Currently active voice AI interactions</p>
            </div>
            <span className="px-3 py-1 bg-emerald-50 text-emerald-600 rounded-full text-[10px] font-black uppercase tracking-widest">{activeCalls.length} Active Now</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {activeCalls.map((call) => (
              <LiveCallCard key={call.sid} call={call} />
            ))}
          </div>
        </div>
      )}

      {/* Charts + Recent Calls */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Area Chart - 2/3 width */}
        <div className="lg:col-span-2 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm">
          <div className="flex items-center justify-between mb-10">
            <div>
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <BarChart3 className="w-6 h-6 text-emerald-500" />Calls Per Day
              </h2>
              <p className="text-sm text-slate-400 font-medium">Last 7 days call volume</p>
            </div>
          </div>
          <div className="h-[350px]">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData}>
                <defs>
                  <linearGradient id="colorCalls" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#10b981" stopOpacity={0.15} />
                    <stop offset="95%" stopColor="#10b981" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="colorConnected" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.1} />
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
                <XAxis dataKey="name" axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12, fontWeight: 600 }} dy={10} />
                <YAxis axisLine={false} tickLine={false} tick={{ fill: '#94a3b8', fontSize: 12 }} />
                <Tooltip contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 30px rgba(0,0,0,0.1)', padding: '12px' }} />
                <Area type="monotone" dataKey="calls" stroke="#10b981" fillOpacity={1} fill="url(#colorCalls)" strokeWidth={4} />
                <Area type="monotone" dataKey="connected" stroke="#3b82f6" fillOpacity={1} fill="url(#colorConnected)" strokeWidth={4} strokeDasharray="6 6" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Right column: Pie Chart + Recent Calls */}
        <div className="space-y-8">
          {/* Pie Chart */}
          <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm flex flex-col">
            <div className="mb-8">
              <h2 className="text-xl font-black text-slate-900 flex items-center gap-2">
                <TrendingUp className="w-6 h-6 text-emerald-500" />Call Conversion
              </h2>
              <p className="text-sm text-slate-400 font-medium">Ratio of successful completions</p>
            </div>

            <div className="flex-1 flex flex-col justify-center items-center">
              {conversionData.length > 0 ? (
                <div className="w-full h-[200px] relative">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie data={conversionData} cx="50%" cy="50%" innerRadius={55} outerRadius={80} paddingAngle={10} dataKey="value" stroke="none">
                        {conversionData.map((entry, index) => (
                          <Cell key={`cell-${index}`} fill={entry.color} />
                        ))}
                      </Pie>
                      <Tooltip />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="absolute inset-0 flex flex-col items-center justify-center pointer-events-none">
                    <span className="text-3xl font-black text-slate-900">
                      {totalCalls > 0 ? Math.round((totalConnected / totalCalls) * 100) : 0}%
                    </span>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Success</span>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col items-center text-slate-300 py-12">
                  <PhoneOff className="w-12 h-12 mb-4" />
                  <p className="text-xs font-bold uppercase tracking-widest">No Interaction Data</p>
                </div>
              )}

              <div className="grid grid-cols-2 gap-4 w-full mt-6">
                <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-100">
                  <p className="text-[10px] font-black text-emerald-600 uppercase mb-1">Success</p>
                  <p className="text-xl font-black text-emerald-700">{totalConnected}</p>
                </div>
                <div className="p-4 rounded-2xl bg-red-50 border border-red-100">
                  <p className="text-[10px] font-black text-red-600 uppercase mb-1">Failed</p>
                  <p className="text-xl font-black text-red-700">{totalFailed}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Recent Calls */}
          <div className="bg-white p-6 rounded-[2rem] border border-slate-200 shadow-sm">
            <div className="mb-6">
              <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
                <ListOrdered className="w-5 h-5 text-emerald-500" />Recent Calls
              </h2>
              <p className="text-xs text-slate-400 font-medium">Last 10 completed calls</p>
            </div>
            {recentCalls.length > 0 ? (
              <div className="space-y-3">
                {recentCalls.map((call: any) => (
                  <div key={call.sid} className="flex items-center justify-between p-3 bg-slate-50 rounded-xl hover:bg-white hover:shadow-sm transition-all">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                        <Phone className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-bold text-slate-900 truncate">{call.phoneNumber}</p>
                        <div className="flex items-center gap-2 text-[10px] text-slate-400 font-medium">
                          {call.agentName && <span>{call.agentName}</span>}
                          {call.provider && (
                            <span className={`uppercase font-black px-1.5 py-0.5 rounded ${call.provider === 'twilio' ? 'bg-red-50 text-red-500' : 'bg-blue-50 text-blue-500'}`}>
                              {call.provider}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    <div className="text-right shrink-0 ml-3">
                      <span className={`text-[10px] uppercase font-black px-2 py-1 rounded-lg border ${statusBadge(call.status)}`}>
                        {call.status}
                      </span>
                      <div className="flex items-center justify-end gap-2 mt-1">
                        {call.duration != null && (
                          <span className="text-[10px] font-mono text-slate-400">{formatDuration(call.duration)}</span>
                        )}
                        <span className="text-[10px] text-slate-300">{formatTimestamp(call.timestamp)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center text-slate-300 py-8">
                <PhoneOff className="w-10 h-10 mb-3" />
                <p className="text-xs font-bold uppercase tracking-widest">No calls yet</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default Dashboard;
