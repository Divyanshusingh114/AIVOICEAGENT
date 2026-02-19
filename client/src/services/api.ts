const BASE_URL = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// Agents
export const api = {
  // Agents
  getAgents: () => request<any[]>('/agents'),
  getAgent: (id: string) => request<any>(`/agents/${id}`),
  createAgent: (data: any) => request<any>('/agents', { method: 'POST', body: JSON.stringify(data) }),
  updateAgent: (id: string, data: any) => request<any>(`/agents/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteAgent: (id: string) => request<any>(`/agents/${id}`, { method: 'DELETE' }),

  // Campaigns
  getCampaigns: () => request<any[]>('/campaigns'),
  getCampaign: (id: string) => request<any>(`/campaigns/${id}`),
  createCampaign: (data: any) => request<any>('/campaigns', { method: 'POST', body: JSON.stringify(data) }),
  updateCampaign: (id: string, data: any) => request<any>(`/campaigns/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteCampaign: (id: string) => request<any>(`/campaigns/${id}`, { method: 'DELETE' }),
  startCampaign: (id: string) => request<any>(`/campaigns/${id}/start`, { method: 'POST' }),
  pauseCampaign: (id: string) => request<any>(`/campaigns/${id}/pause`, { method: 'POST' }),
  stopCampaign: (id: string) => request<any>(`/campaigns/${id}/stop`, { method: 'POST' }),
  scheduleCampaign: (id: string, scheduledAt: string) =>
    request<any>(`/campaigns/${id}/schedule`, { method: 'POST', body: JSON.stringify({ scheduledAt }) }),
  cancelSchedule: (id: string) => request<any>(`/campaigns/${id}/cancel-schedule`, { method: 'POST' }),

  // Calls
  getCallLogs: (params?: { page?: number; limit?: number; search?: string; status?: string }) => {
    const qs = new URLSearchParams();
    if (params?.page) qs.set('page', String(params.page));
    if (params?.limit) qs.set('limit', String(params.limit));
    if (params?.search) qs.set('search', params.search);
    if (params?.status) qs.set('status', params.status);
    return request<{ logs: any[]; pagination: any }>(`/calls/logs?${qs.toString()}`);
  },
  makeOutboundCall: (to: string, agentId: string, provider: 'twilio' | 'plivo' = 'twilio') =>
    request<{ success: boolean; callSid: string }>('/calls/outbound', {
      method: 'POST',
      body: JSON.stringify({ to, agentId, provider }),
    }),

  // Settings
  getSettings: () => request<Record<string, string>>('/settings'),
  saveSettings: (data: Record<string, string>) =>
    request<any>('/settings', { method: 'PUT', body: JSON.stringify(data) }),
  testTwilio: () => request<{ success: boolean; message: string }>('/settings/test-twilio', { method: 'POST' }),
  testElevenLabs: () => request<{ success: boolean; message: string }>('/settings/test-elevenlabs', { method: 'POST' }),
  testPlivo: (data?: any) => request<{ success: boolean; message: string }>('/settings/test-plivo', {
    method: 'POST',
    body: data ? JSON.stringify(data) : undefined
  }),

  // Analytics
  getDashboard: () => request<any>('/analytics/dashboard'),

  // ElevenLabs proxy
  getSignedUrl: (agentId: string) =>
    request<{ signedUrl: string }>(`/elevenlabs/signed-url?agent_id=${encodeURIComponent(agentId)}`),

  // ElevenLabs Conversations
  getConversations: (params?: { agent_id?: string; page_size?: number; cursor?: string }) => {
    const qs = new URLSearchParams();
    if (params?.agent_id) qs.set('agent_id', params.agent_id);
    if (params?.page_size) qs.set('page_size', String(params.page_size));
    if (params?.cursor) qs.set('cursor', params.cursor);
    return request<{
      conversations: any[];
      next_cursor: string | null;
      has_more: boolean;
    }>(`/elevenlabs/conversations?${qs.toString()}`);
  },
  getConversationDetails: (conversationId: string) =>
    request<any>(`/elevenlabs/conversations/${encodeURIComponent(conversationId)}`),
  getConversationAudioUrl: (conversationId: string) =>
    `/api/elevenlabs/conversations/${encodeURIComponent(conversationId)}/audio`,
};
