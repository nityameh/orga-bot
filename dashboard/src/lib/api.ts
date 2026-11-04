const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000/api/v1';

function getPhone(): string {
  if (typeof window === 'undefined') return '';
  return localStorage.getItem('orga_phone') || '';
}

async function apiFetch(path: string, options?: RequestInit) {
  const phone = getPhone();
  const separator = path.includes('?') ? '&' : '?';
  const url = `${API_URL}${path}${phone ? `${separator}phone=${phone}` : ''}`;

  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      ...options?.headers,
    },
  });

  if (res.status === 401 || res.status === 404) {
    if (typeof window !== 'undefined') {
      localStorage.removeItem('orga_phone');
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
