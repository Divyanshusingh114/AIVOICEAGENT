import React, { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { api } from '../services/api';

import type { VoiceAgent, Campaign, CallLog, CallEvent, ActiveCall } from '../../../shared/types';

interface BackendContextType {
  agents: VoiceAgent[];
  campaigns: Campaign[];
  logs: CallLog[];
  activeCalls: ActiveCall[];
  isLoading: boolean;
  error: string | null;
  isProviderReady: (provider: 'elevenlabs' | 'twilio' | 'asterisk') => boolean;
  addAgent: (agent: Omit<VoiceAgent, 'id'>) => Promise<void>;
  deleteAgent: (id: string) => Promise<void>;
  updateAgent: (id: string, updates: Partial<VoiceAgent>) => Promise<void>;
  addCampaign: (campaign: any) => Promise<void>;
  deleteCampaign: (id: string) => Promise<void>;
  updateCampaign: (id: string, updates: any) => Promise<void>;
  startCampaign: (id: string) => Promise<void>;
  pauseCampaign: (id: string) => Promise<void>;
  stopCampaign: (id: string) => Promise<void>;
  scheduleCampaign: (id: string, scheduledAt: string) => Promise<void>;
  cancelSchedule: (id: string) => Promise<void>;
  initiateTestCall: (to: string, agentId: string, provider?: 'twilio' | 'plivo') => Promise<string>;
  refreshData: () => Promise<void>;
  callEvents: CallEvent[];
}

const BackendContext = createContext<BackendContextType | undefined>(undefined);

export const BackendProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [agents, setAgents] = useState<VoiceAgent[]>([]);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [logs, setLogs] = useState<CallLog[]>([]);
  const [activeCalls, setActiveCalls] = useState<ActiveCall[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [callEvents, setCallEvents] = useState<CallEvent[]>([]);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const eventSourceRef = useRef<EventSource | null>(null);

  // Load all data from backend
  const refreshData = useCallback(async () => {
    try {
      setIsLoading(true);
      const [agentsData, campaignsData, logsResult, settingsData] = await Promise.all([
        api.getAgents(),
        api.getCampaigns(),
        api.getCallLogs({ limit: 100 }),
        api.getSettings().catch(() => ({})),
      ]);
      setAgents(agentsData);
      setCampaigns(campaignsData);
      setLogs(logsResult.logs);
      setSettings(settingsData);
      setError(null);
    } catch (err: any) {
      console.error('Failed to load data:', err);
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  // Initial load
  useEffect(() => {
    refreshData();
  }, [refreshData]);

  // SSE subscription for real-time updates
  useEffect(() => {
    const es = new EventSource('/api/events/calls');
    eventSourceRef.current = es;

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data) as CallEvent;
        if (data.type === 'connected' as any) return;

        setCallEvents(prev => [...prev.slice(-100), data]);

        // Update active calls and logs based on events
        if (data.type === 'call_started') {
          setActiveCalls(prev => [...prev, {
            id: data.callSid,
            sid: data.callSid,
            phoneNumber: data.phoneNumber || '',
            campaignId: data.campaignId,
            agentId: data.agentId || '',
            status: 'initiated',
            startTime: Date.now(),
          }]);
        } else if (data.type === 'call_status') {
          setActiveCalls(prev => prev.map(c =>
            c.sid === data.callSid ? { ...c, status: data.status || c.status } : c
          ));
        } else if (data.type === 'call_ended') {
          setActiveCalls(prev => prev.filter(c => c.sid !== data.callSid));
          // Refresh logs to pick up the completed call
          api.getCallLogs({ limit: 100 }).then(r => {
            console.log(`[BackendContext] Refreshed logs after call_ended: ${r.logs.length} entries`);
            setLogs(r.logs);
          }).catch((err) => {
            console.error('[BackendContext] Failed to refresh logs after call_ended:', err);
          });
          // Refresh campaigns to get updated counts
          api.getCampaigns().then(c => setCampaigns(c)).catch(() => { });
        }
      } catch {
        // ignore parse errors
      }
    };

    es.onerror = () => {
      // EventSource auto-reconnects
    };

    return () => {
      es.close();
    };
  }, []);

  const isProviderReady = (provider: 'elevenlabs' | 'twilio' | 'asterisk') => {
    // Check server-side env config (the server has these in .env)
    // We consider providers ready if the server is running
    switch (provider) {
      case 'elevenlabs': return true;
      case 'twilio': return true;
      case 'asterisk': return !!settings.asteriskSipHost;
      default: return false;
    }
  };

  const addAgent = async (agent: Omit<VoiceAgent, 'id'>) => {
    const created = await api.createAgent(agent);
    setAgents(prev => [created, ...prev]);
  };

  const deleteAgent = async (id: string) => {
    await api.deleteAgent(id);
    setAgents(prev => prev.filter(a => a.id !== id));
    setCampaigns(prev => prev.filter(c => c.agentId !== id));
  };

  const updateAgent = async (id: string, updates: Partial<VoiceAgent>) => {
    const updated = await api.updateAgent(id, updates);
    setAgents(prev => prev.map(a => a.id === id ? updated : a));
  };

  const addCampaign = async (campaign: any) => {
    const created = await api.createCampaign(campaign);
    setCampaigns(prev => [created, ...prev]);
  };

  const deleteCampaign = async (id: string) => {
    await api.deleteCampaign(id);
    setCampaigns(prev => prev.filter(c => c.id !== id));
  };

  const updateCampaign = async (id: string, updates: any) => {
    const updated = await api.updateCampaign(id, updates);
    setCampaigns(prev => prev.map(c => c.id === id ? updated : c));
  };

  const startCampaignAction = async (id: string) => {
    await api.startCampaign(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'active' as const } : c));
  };

  const pauseCampaignAction = async (id: string) => {
    await api.pauseCampaign(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'paused' as const } : c));
  };

  const stopCampaignAction = async (id: string) => {
    await api.stopCampaign(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'stopped' as const } : c));
  };

  const scheduleCampaignAction = async (id: string, scheduledAt: string) => {
    await api.scheduleCampaign(id, scheduledAt);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'scheduled' as const, scheduledAt } : c));
  };

  const cancelScheduleAction = async (id: string) => {
    await api.cancelSchedule(id);
    setCampaigns(prev => prev.map(c => c.id === id ? { ...c, status: 'stopped' as const, scheduledAt: undefined } : c));
  };

  const initiateTestCall = async (to: string, agentId: string, provider: 'twilio' | 'plivo' = 'twilio') => {
    const result = await api.makeOutboundCall(to, agentId, provider);
    return result.callSid;
  };

  return (
    <BackendContext.Provider value={{
      agents, campaigns, logs, activeCalls,
      isLoading, error,
      isProviderReady, addAgent, deleteAgent, updateAgent,
      addCampaign, deleteCampaign, updateCampaign,
      startCampaign: startCampaignAction,
      pauseCampaign: pauseCampaignAction,
      stopCampaign: stopCampaignAction,
      scheduleCampaign: scheduleCampaignAction,
      cancelSchedule: cancelScheduleAction,
      initiateTestCall, refreshData, callEvents,
    }}>
      {children}
    </BackendContext.Provider>
  );
};

export const useBackend = () => {
  const context = useContext(BackendContext);
  if (!context) throw new Error('useBackend must be used within BackendProvider');
  return context;
};
