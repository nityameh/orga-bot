// Same-origin path: next.config.ts proxies /api/v1/* to the backend, so the
// session cookie is first-party and never exposed to JavaScript (ADR-006).
const API_URL = '/api/v1';

async function apiFetch(path: string, options?: RequestInit) {
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    credentials: 'same-origin',
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401) {
    if (typeof window !== 'undefined' && !window.location.pathname.startsWith('/login')) {
      window.location.href = '/login';
    }
    throw new Error('Not authenticated');
  }

  if (!res.ok) {
    const text = await res.text();
    throw new Error(text);
  }

  return res.json();
}

export const api = {
  // Auth
  exchangeLoginToken: (token: string) =>
    apiFetch('/auth/exchange', { method: 'POST', body: JSON.stringify({ token }) }),
  logout: () => apiFetch('/auth/logout', { method: 'POST', body: '{}' }),
  me: () => apiFetch('/auth/me'),

  // Analytics (Phase 5)
  getAnalyticsOverview: (days: number) => apiFetch(`/analytics/overview?days=${days}`),
  getAnalyticsPeople: () => apiFetch('/analytics/people'),
  getTimeline: (params: Record<string, string>) => apiFetch(`/analytics/timeline?${new URLSearchParams(params)}`),

  // Integrations
  getIntegrations: () => apiFetch('/integrations'),
  startGoogleConnect: () => apiFetch('/integrations/google/start', { method: 'POST', body: '{}' }),
  disconnectGoogle: () => apiFetch('/integrations/google', { method: 'DELETE' }),

  // Notes
  createNote: (data: Record<string, unknown>) =>
    apiFetch('/notes', { method: 'POST', body: JSON.stringify(data) }),
  getNotes: (params?: Record<string, string>) =>
    apiFetch(`/notes?${new URLSearchParams(params)}`),
  getNote: (id: string) => apiFetch(`/notes/${id}`),
  updateNote: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/notes/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteNote: (id: string) =>
    apiFetch(`/notes/${id}`, { method: 'DELETE' }),
  pinNote: (id: string) =>
    apiFetch(`/notes/${id}/pin`, { method: 'POST' }),
  archiveNote: (id: string) =>
    apiFetch(`/notes/${id}/archive`, { method: 'POST' }),

  // Tasks
  createTask: (data: Record<string, unknown>) =>
    apiFetch('/tasks', { method: 'POST', body: JSON.stringify(data) }),
  getTasks: (params?: Record<string, string>) =>
    apiFetch(`/tasks?${new URLSearchParams(params)}`),
  getTask: (id: string) => apiFetch(`/tasks/${id}`),
  updateTask: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/tasks/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  updateTaskItems: (id: string, items: unknown[]) =>
    apiFetch(`/tasks/${id}/items`, { method: 'PUT', body: JSON.stringify({ items }) }),
  deleteTask: (id: string) =>
    apiFetch(`/tasks/${id}`, { method: 'DELETE' }),

  // Reminders
  createReminder: (data: Record<string, unknown>) =>
    apiFetch('/reminders', { method: 'POST', body: JSON.stringify(data) }),
  getReminders: (params?: Record<string, string>) =>
    apiFetch(`/reminders?${new URLSearchParams(params)}`),
  updateReminder: (id: string, data: Record<string, unknown>) =>
    apiFetch(`/reminders/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  deleteReminder: (id: string) =>
    apiFetch(`/reminders/${id}`, { method: 'DELETE' }),

  // Clients
  getClients: () => apiFetch('/clients'),
  getClient: (name: string) => apiFetch(`/clients/${encodeURIComponent(name)}`),
};
