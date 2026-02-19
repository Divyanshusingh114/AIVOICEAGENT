import React from 'react';
import { HashRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { BackendProvider } from './context/BackendContext';
import Sidebar from './components/Sidebar';
import Header from './components/Header';
import Dashboard from './pages/Dashboard';
import Campaigns from './pages/Campaigns';
import Agents from './pages/Agents';
import CallLogs from './pages/CallLogs';
import Settings from './pages/Settings';

const App: React.FC = () => {
  return (
    <BackendProvider>
      <Router>
        <div className="flex h-screen overflow-hidden bg-slate-50">
          <Sidebar />
          <div className="relative flex flex-1 flex-col overflow-y-auto overflow-x-hidden">
            <Header />
            <main className="p-4 md:p-6 lg:p-8">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/campaigns" element={<Campaigns />} />
                <Route path="/agents" element={<Agents />} />
                <Route path="/logs" element={<CallLogs />} />
                <Route path="/settings" element={<Settings />} />
                <Route path="*" element={<Navigate to="/" replace />} />
              </Routes>
            </main>
          </div>
        </div>
      </Router>
    </BackendProvider>
  );
};

export default App;
