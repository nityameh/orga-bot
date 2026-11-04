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
