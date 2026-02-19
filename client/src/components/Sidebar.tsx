import React from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard,
  Megaphone,
  Mic2,
  ClipboardList,
  Settings as SettingsIcon,
  PhoneCall
} from 'lucide-react';

const Sidebar: React.FC = () => {
  const location = useLocation();

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/' },
    { name: 'Campaigns', icon: Megaphone, path: '/campaigns' },
    { name: 'Agents', icon: Mic2, path: '/agents' },
    { name: 'Call Logs', icon: ClipboardList, path: '/logs' },
    { name: 'Settings', icon: SettingsIcon, path: '/settings' },
  ];

  return (
    <div className="hidden lg:flex flex-col w-64 bg-slate-900 text-white h-screen transition-all duration-300">
      <div className="p-6 flex items-center gap-3">
        <div className="p-2 bg-emerald-500 rounded-lg">
          <PhoneCall className="w-6 h-6 text-white" />
        </div>
        <span className="text-xl font-bold tracking-tight">kredmint.ai</span>
      </div>

      <nav className="flex-1 px-4 mt-6">
        <ul className="space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <li key={item.path}>
                <Link
                  to={item.path}
                  className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all ${
                    isActive
                      ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800'
                  }`}
                >
                  <item.icon className="w-5 h-5" />
                  <span className="font-medium">{item.name}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      <div className="p-6">
        <div className="bg-slate-800/50 rounded-2xl p-4 border border-slate-700">
          <p className="text-xs text-slate-400 uppercase font-bold tracking-wider mb-2">Support</p>
          <p className="text-sm text-slate-300">Enterprise Node ID:</p>
          <code className="text-xs text-emerald-400">#KM-99120-EL</code>
        </div>
      </div>
    </div>
  );
};

export default Sidebar;
