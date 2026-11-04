'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Reminder } from '@/lib/types';

const STATUS_TABS = ['all', 'pending', 'fired', 'done', 'snoozed'] as const;

const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  fired: 'bg-red-100 text-red-700',
  done: 'bg-green-100 text-green-700',
  snoozed: 'bg-blue-100 text-blue-700',
};

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
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Reminders</h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
        >
          + New Reminder
        </button>
      </div>

      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <input
            type="text"
            placeholder="What to remember (e.g. Call Ravi about proposal)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full font-medium text-sm mb-2 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            autoFocus
          />
          <div className="flex gap-2 mb-3">
            <input
              type="date"
              value={newDate}
              onChange={(e) => setNewDate(e.target.value)}
              className="flex-1 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
            <input
              type="time"
              value={newTime}
              onChange={(e) => setNewTime(e.target.value)}
              className="w-32 text-sm px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            />
          </div>
          <div className="flex gap-2">
            <button onClick={handleCreateReminder} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Save</button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <div className="flex gap-2 mb-6">
        {STATUS_TABS.map(tab => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-3 py-1.5 text-xs rounded-lg capitalize transition-colors ${
              activeTab === tab
                ? 'bg-gray-900 text-white'
                : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : reminders.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No reminders</p>
          <p className="text-sm">Send "remind me tomorrow 9am to call Ravi" on WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-3">
          {reminders.map(reminder => (
            <div key={reminder.id} className="bg-white border border-gray-200 rounded-xl p-4 flex items-center justify-between">
              <div>
                <h3 className="font-medium text-sm text-gray-900">{reminder.title}</h3>
                <p className="text-xs text-gray-400 mt-1">
                  {new Date(reminder.fireAt).toLocaleString('en-IN', {
                    weekday: 'short', month: 'short', day: 'numeric',
                    hour: '2-digit', minute: '2-digit',
                    timeZone: 'Asia/Kolkata', hour12: true,
                  })}
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className={`px-2 py-0.5 text-xs rounded-full ${STATUS_COLORS[reminder.status] || 'bg-gray-100'}`}>
                  {reminder.status}
                </span>
                {reminder.status !== 'done' && (
                  <button onClick={() => markDone(reminder.id)} className="text-xs text-gray-400 hover:text-green-600">
                    done
                  </button>
                )}
                <button onClick={() => deleteReminder(reminder.id)} className="text-xs text-gray-400 hover:text-red-500">
                  delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
