'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Task, TaskItem } from '@/lib/types';
import { EmptyState, PageHeader, SkeletonCards } from '@/components/ui';
import { ArrowDownIcon, ArrowUpIcon, CheckIcon, ChevronDownIcon, PlusIcon, TaskIcon, TrashIcon } from '@/components/icons';

/** Ring showing how much of a list is done. */
function ProgressRing({ done, total }: { done: number; total: number }) {
  const pct = total ? done / total : 0;
  const r = 16;
  const c = 2 * Math.PI * r;
  return (
    <svg width="40" height="40" viewBox="0 0 40 40" className="shrink-0" aria-label={`${done} of ${total} done`}>
      <circle cx="20" cy="20" r={r} fill="none" stroke="var(--color-ink-100)" strokeWidth="4" />
      <circle cx="20" cy="20" r={r} fill="none" stroke={pct === 1 ? 'var(--color-emerald-500)' : 'var(--color-brand-500)'}
        strokeWidth="4" strokeLinecap="round" strokeDasharray={c} strokeDashoffset={c * (1 - pct)}
        transform="rotate(-90 20 20)" className="transition-all duration-500" />
      <text x="20" y="24" textAnchor="middle" className="fill-ink-700 text-[10px] font-semibold">{Math.round(pct * 100)}%</text>
    </svg>
  );
}

export default function TasksPage() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newItems, setNewItems] = useState('');

  const loadTasks = async () => {
    setLoading(true);
    const data = await api.getTasks({ limit: '50' });
    setTasks(data.tasks);
    setLoading(false);
  };

  useEffect(() => { loadTasks(); }, []);

  const toggleItem = async (task: Task, itemId: number) => {
    const newItems = task.items.map(item =>
      item.id === itemId ? { ...item, done: !item.done } : item
    );
    await api.updateTaskItems(task.id, newItems);
    loadTasks();
  };

  const moveItem = async (task: Task, fromIndex: number, toIndex: number) => {
    const newItems = [...task.items];
    const [moved] = newItems.splice(fromIndex, 1);
    newItems.splice(toIndex, 0, moved);
    // Update order values
    const reordered = newItems.map((item, i) => ({ ...item, order: i }));
    await api.updateTaskItems(task.id, reordered);
    loadTasks();
  };

  const deleteTask = async (id: string) => {
    if (!confirm('Delete this task list?')) return;
    await api.deleteTask(id);
    loadTasks();
  };

  const handleCreateTask = async () => {
    if (!newTitle.trim() || !newItems.trim()) return;
    const items = newItems.split(',').map(s => s.trim()).filter(Boolean);
    await api.createTask({ title: newTitle.trim(), items });
    setNewTitle(''); setNewItems('');
    setShowNewForm(false);
    loadTasks();
  };

  const openCount = tasks.reduce((n, t) => n + t.items.filter((i) => !i.done).length, 0);

  return (
    <div className="max-w-4xl">
      <PageHeader
        title="Tasks"
        subtitle={loading ? ' ' : `${openCount} open ${openCount === 1 ? 'to-do' : 'to-dos'} across ${tasks.length} ${tasks.length === 1 ? 'list' : 'lists'}`}
        actions={
          <button onClick={() => setShowNewForm(!showNewForm)} className="btn btn-primary">
            <PlusIcon size={16} /> New task list
          </button>
        }
      />

      {showNewForm && (
        <div className="card mb-6 space-y-3 p-5 animate-fade-up">
          <input type="text" placeholder="Task list name (e.g. Acme project)" value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)} className="input font-medium" autoFocus />
          <textarea placeholder="Items (comma separated, e.g. send invoice, review brief, call ravi)" value={newItems}
            onChange={(e) => setNewItems(e.target.value)} className="input resize-none" rows={2} />
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreateTask} className="btn btn-primary">Save list</button>
            <button onClick={() => setShowNewForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      {loading ? (
        <SkeletonCards count={4} height="h-20" cols="" />
      ) : tasks.length === 0 ? (
        <EmptyState icon={<TaskIcon size={18} />} title="No task lists yet"
          hint={<>Send <span className="font-mono text-ink-700">tasks: item1, item2, item3</span> to Orga on WhatsApp.</>} />
      ) : (
        <div className="space-y-3 animate-fade-up">
          {tasks.map(task => {
            const isExpanded = expandedId === task.id;
            const pending = task.items.filter(i => !i.done).length;
            const done = task.items.filter(i => i.done).length;

            return (
              <div key={task.id} className={`card overflow-hidden transition ${isExpanded ? 'ring-brand-200' : ''}`}>
                <div className="flex cursor-pointer items-center gap-4 p-4 transition hover:bg-ink-50/60"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}>
                  <ProgressRing done={done} total={task.items.length} />
                  <div className="min-w-0 flex-1">
                    <h3 className="truncate text-[15px] font-semibold text-ink-900">{task.title}</h3>
                    <p className="mt-0.5 text-xs text-ink-400">
                      {pending} pending · {done} done
                      {task.client && <> · <span className="font-medium capitalize text-ink-600">{task.client}</span></>}
                    </p>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                    className="btn btn-danger btn-sm p-2" title="Delete list" aria-label="Delete task list">
                    <TrashIcon size={15} />
                  </button>
                  <span className={`text-ink-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}><ChevronDownIcon size={18} /></span>
                </div>

                {isExpanded && (
                  <div className="space-y-1 border-t border-ink-100 bg-ink-50/40 p-3">
                    {task.items.map((item, index) => (
                      <TaskItemRow
                        key={item.id}
                        item={item}
                        index={index}
                        total={task.items.length}
                        onToggle={() => toggleItem(task, item.id)}
                        onMoveUp={() => moveItem(task, index, index - 1)}
                        onMoveDown={() => moveItem(task, index, index + 1)}
                      />
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function TaskItemRow({
  item, index, total, onToggle, onMoveUp, onMoveDown,
}: {
  item: TaskItem;
  index: number;
  total: number;
  onToggle: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
}) {
  return (
    <div className="group flex items-center gap-3 rounded-xl px-2 py-2 transition hover:bg-white">
      <button
        onClick={onToggle}
        aria-label={item.done ? `Mark "${item.text}" as not done` : `Mark "${item.text}" as done`}
        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md ring-1 transition ${item.done
          ? 'bg-brand-600 text-white ring-brand-600'
          : 'bg-white ring-ink-300 hover:ring-brand-500'}`}
      >
        {item.done && <CheckIcon size={13} strokeWidth={2.5} />}
      </button>

      <span className={`flex-1 text-sm ${item.done ? 'text-ink-400 line-through' : 'text-ink-700'}`}>{item.text}</span>

      <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100">
        {index > 0 && (
          <button onClick={onMoveUp} className="btn btn-ghost btn-sm p-1" aria-label="Move up"><ArrowUpIcon size={14} /></button>
        )}
        {index < total - 1 && (
          <button onClick={onMoveDown} className="btn btn-ghost btn-sm p-1" aria-label="Move down"><ArrowDownIcon size={14} /></button>
        )}
      </div>
    </div>
  );
}
