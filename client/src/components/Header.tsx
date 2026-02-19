import React from 'react';
import { Bell, Search, ShieldCheck, ShieldAlert, User } from 'lucide-react';
import { useBackend } from '../context/BackendContext';

const Header: React.FC = () => {
  const { isProviderReady } = useBackend();
  const isConfigured = isProviderReady('elevenlabs') && isProviderReady('twilio');

  return (
    <header className="sticky top-0 z-10 flex h-16 w-full items-center justify-between border-b bg-white/80 px-4 backdrop-blur-md md:px-6">
      <div className="flex items-center gap-4 flex-1">
        <div className="relative w-full max-w-md hidden md:block">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search calls, agents, campaigns..."
            className="w-full rounded-full bg-slate-100 py-2 pl-10 pr-4 text-sm outline-none ring-emerald-500 transition focus:ring-2"
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full text-xs font-medium border ${
          isConfigured
            ? 'bg-emerald-50 text-emerald-600 border-emerald-200'
            : 'bg-red-50 text-red-600 border-red-200'
        }`}>
          {isConfigured ? <ShieldCheck className="w-3.5 h-3.5" /> : <ShieldAlert className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{isConfigured ? 'Backend Live' : 'Backend Incomplete'}</span>
        </div>

        <button className="relative p-2 text-slate-400 hover:text-slate-600">
          <Bell className="h-5 w-5" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-red-500 border-2 border-white"></span>
        </button>

        <div className="h-8 w-px bg-slate-200 mx-1"></div>

        <div className="flex items-center gap-3 pl-1">
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-slate-900 leading-tight">Admin User</p>
            <p className="text-xs text-slate-500">Super Administrator</p>
          </div>
          <div className="h-10 w-10 rounded-full bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-sm">
            <User className="w-6 h-6" />
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
