// Types matching Prisma models

export interface User {
  id: string;
  phone: string;
  tier: string;
  lang: string;
  createdAt: string;
}

export interface Note {
  id: string;
  userId: string;
  title: string;
  body: string | null;
  tags: string[];
  client: string | null;
  project: string | null;
  pinned: boolean;
  archivedAt: string | null;
  createdAt: string;
  deletedAt: string | null;
}

export interface TaskItem {
  id: number;
  text: string;
  done: boolean;
  order: number;
}

export interface Task {
  id: string;
  userId: string;
  title: string;
  items: TaskItem[];
  tags: string[];
  client: string | null;
  createdAt: string;
}

export interface Reminder {
  id: string;
  userId: string;
  title: string;
  fireAt: string;
  status: 'pending' | 'fired' | 'done' | 'snoozed';
  snoozeUntil: string | null;
  createdAt: string;
}

export interface Client {
  name: string;
  noteCount: number;
  taskCount: number;
  reminderCount: number;
}

// ─── Analytics (Phase 5) ─────────────────────────────────────────────────

export interface Overview {
  days: number;
  series: { date: string; messages: number; actions: number }[];
  heatmap: number[][];
  reminders: { done: number; missed: number; upcoming: number; completionRate: number | null };
  agent: {
    turns: number;
    latencyMs: { p50: number | null; p95: number | null };
    cacheHitRate: number | null;
    costUSD: { total: number; perTurn: number | null };
    toolUse: Record<string, number>;
  };
  approvals: { requested: number; granted: number; rejected: number };
  nudges: { sent: number; byRule: Record<string, number> };
  messages: number;
}

export interface PersonInsight {
  person: string;
  interactions: number;
  lastInteraction: string;
  daysSinceLast: number;
  openTasks: number;
  goneQuiet: boolean;
}

export interface TimelineItem {
  id: string;
  kind: string;
  channel: string | null;
  person: string | null;
  summary: string | null;
  traceId: string | null;
  costMicros: number | null;
  createdAt: string;
  details?: Record<string, unknown>;
}
