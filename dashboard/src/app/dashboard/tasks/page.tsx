'use client';

import { useEffect, useState } from 'react';
import { api } from '@/lib/api';
import { Task, TaskItem } from '@/lib/types';

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

  if (loading) return <p className="text-gray-400 text-sm">Loading...</p>;

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Tasks ({tasks.length})</h1>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
        >
          + New Task List
        </button>
      </div>

      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <input
            type="text"
            placeholder="Task list name (e.g. Acme project)"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full font-medium text-sm mb-2 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            autoFocus
          />
          <textarea
            placeholder="Items (comma separated, e.g. send invoice, review brief, call ravi)"
            value={newItems}
            onChange={(e) => setNewItems(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-3 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            rows={2}
          />
          <div className="flex gap-2">
            <button onClick={handleCreateTask} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Save</button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      {tasks.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No task lists yet</p>
          <p className="text-sm">Send "tasks: item1, item2, item3" to Orga on WhatsApp.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {tasks.map(task => {
            const isExpanded = expandedId === task.id;
            const pending = task.items.filter(i => !i.done).length;
            const done = task.items.filter(i => i.done).length;

            return (
              <div key={task.id} className="bg-white border border-gray-200 rounded-xl overflow-hidden">
                <div
                  className="flex items-center justify-between p-4 cursor-pointer hover:bg-gray-50"
                  onClick={() => setExpandedId(isExpanded ? null : task.id)}
                >
                  <div>
                    <h3 className="font-medium text-sm text-gray-900">{task.title}</h3>
                    <p className="text-xs text-gray-400 mt-0.5">
                      {pending} pending, {done} done
                      {task.client && ` · ${task.client}`}
                    </p>
                  </div>
                  <div className="flex items-center gap-3">
                    <button
                      onClick={(e) => { e.stopPropagation(); deleteTask(task.id); }}
                      className="text-xs text-gray-400 hover:text-red-500"
                    >
                      delete
                    </button>
                    <span className="text-gray-400 text-xs">{isExpanded ? '▲' : '▼'}</span>
                  </div>
                </div>

                {isExpanded && (
                  <div className="border-t border-gray-100 p-4 space-y-2">
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
    <div className="flex items-center gap-3 group">
      <button
        onClick={onToggle}
        className={`w-5 h-5 rounded border flex items-center justify-center text-xs shrink-0 ${
          item.done
            ? 'bg-gray-900 border-gray-900 text-white'
            : 'border-gray-300 hover:border-gray-500'
        }`}
      >
        {item.done && '✓'}
      </button>

      <span className={`flex-1 text-sm ${item.done ? 'text-gray-400 line-through' : 'text-gray-700'}`}>
        {item.text}
      </span>

      <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
        {index > 0 && (
          <button onClick={onMoveUp} className="text-xs text-gray-400 hover:text-gray-700 px-1">↑</button>
        )}
        {index < total - 1 && (
          <button onClick={onMoveDown} className="text-xs text-gray-400 hover:text-gray-700 px-1">↓</button>
        )}
      </div>
    </div>
  );
}
