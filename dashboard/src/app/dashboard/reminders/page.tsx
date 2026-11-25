'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Reminder } from '@/lib/types';
import { EmptyState, PageHeader, Segmented, SkeletonCards } from '@/components/ui';
import { BellIcon, CheckIcon, PlusIcon, TrashIcon } from '@/components/icons';

const STATUS_TABS = ['all', 'pending', 'fired', 'done', 'snoozed'] as const;

const STATUS_STYLES: Record<string, string> = {
  pending: 'bg-amber-50 text-amber-700 ring-amber-200',
  fired: 'bg-rose-50 text-rose-700 ring-rose-200',
  done: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  snoozed: 'bg-sky-50 text-sky-700 ring-sky-200',
};

/** Calendar-style date tile in IST. */
function DateTile({ iso }: { iso: string }) {
  const d = new Date(iso);
  const part = (o: Intl.DateTimeFormatOptions) => d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', ...o });
  return (
    <div className="flex w-14 shrink-0 flex-col items-center overflow-hidden rounded-xl ring-1 ring-ink-200">
      <span className="w-full bg-brand-600 py-0.5 text-center text-[10px] font-semibold uppercase tracking-wide text-white">{part({ month: 'short' })}</span>
      <span className="py-1 text-lg font-semibold leading-none text-ink-900">{part({ day: 'numeric' })}</span>
      <span className="pb-1 text-[10px] text-ink-400">{part({ weekday: 'short' })}</span>
    </div>
  );
}

export default function RemindersPage() {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<string>('all');
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDate, setNewDate] = useState('');
  const [newTime, setNewTime] = useState('09:00');

  const loadReminders = async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '50' };
    if (activeTab !== 'all') params.status = activeTab;
    const data = await api.getReminders(params);
    setReminders(data.reminders);
    setLoading(false);
  };

  useEffect(() => { loadReminders(); }, [activeTab]);

  const markDone = async (id: string) => {
    await api.updateReminder(id, { status: 'done' });
    loadReminders();
  };

  const deleteReminder = async (id: string) => {
    if (!confirm('Delete this reminder?')) return;
    await api.deleteReminder(id);
    loadReminders();
  };

  const handleCreateReminder = async () => {
    if (!newTitle.trim() || !newDate) return;
    const fireAt = new Date(`${newDate}T${newTime}:00+05:30`).toISOString();
    await api.createReminder({ title: newTitle.trim(), fireAt });
    setNewTitle(''); setNewDate(''); setNewTime('09:00');
    setShowNewForm(false);
    loadReminders();
  };

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Reminders"
        subtitle="Orga messages you at the right time, in IST."
        actions={
          <button onClick={() => setShowNewForm(!showNewForm)} className="btn btn-primary">
            <PlusIcon size={16} /> New reminder
          </button>
        }
      />

      {showNewForm && (
        <div className="card mb-6 space-y-3 p-5 animate-fade-up">
          <input type="text" placeholder="What to remember (e.g. Call Ravi about proposal)" value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)} className="input font-medium" autoFocus />
          <div className="flex gap-2">
            <input type="date" value={newDate} onChange={(e) => setNewDate(e.target.value)} className="input flex-1" aria-label="Date" />
            <input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} className="input w-36" aria-label="Time" />
          </div>
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreateReminder} className="btn btn-primary">Save reminder</button>
            <button onClick={() => setShowNewForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="mb-6">
        <Segmented label="Filter by status" value={activeTab} onChange={setActiveTab}
          options={STATUS_TABS.map((t) => ({ value: t, label: t }))} />
      </div>

      {loading ? (
        <SkeletonCards count={4} height="h-20" cols="" />
      ) : reminders.length === 0 ? (
        <EmptyState icon={<BellIcon size={18} />} title={activeTab === 'all' ? 'No reminders' : `No ${activeTab} reminders`}
          hint={<>Send <span className="font-mono text-ink-700">remind me tomorrow 9am to call Ravi</span> on WhatsApp.</>} />
      ) : (
        <div className="space-y-3 animate-fade-up">
          {reminders.map(reminder => (
            <div key={reminder.id} className="card card-hover group flex items-center gap-4 p-4">
              <DateTile iso={reminder.fireAt} />
              <div className="min-w-0 flex-1">
                <h3 className={`truncate text-[15px] font-semibold ${reminder.status === 'done' ? 'text-ink-400 line-through' : 'text-ink-900'}`}>
                  {reminder.title}
                </h3>
                <p className="mt-1 text-xs text-ink-400">
                  {new Date(reminder.fireAt).toLocaleString('en-IN', { hour: 'numeric', minute: '2-digit', timeZone: 'Asia/Kolkata', hour12: true })} IST
                </p>
              </div>

              <span className={`chip capitalize ring-1 ${STATUS_STYLES[reminder.status] || ''}`}>{reminder.status}</span>
              <div className="flex gap-1">
                {reminder.status !== 'done' && (
                  <button onClick={() => markDone(reminder.id)} className="btn btn-sm p-2 text-ink-400 hover:bg-emerald-50 hover:text-emerald-600"
                    title="Mark done" aria-label="Mark reminder done"><CheckIcon size={15} /></button>
                )}
                <button onClick={() => deleteReminder(reminder.id)} className="btn btn-danger btn-sm p-2"
                  title="Delete" aria-label="Delete reminder"><TrashIcon size={15} /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
