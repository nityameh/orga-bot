'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Note } from '@/lib/types';

export default function NoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const [note, setNote] = useState<Note | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      const data = await api.getNote(id);
      setNote(data);
      setTitle(data.title);
      setBody(data.body || '');
      setLoading(false);
    }
    load();
  }, [id]);

  const handleSave = async () => {
    setSaving(true);
    const updated = await api.updateNote(id, { title, body });
    setNote(updated);
    setEditing(false);
    setSaving(false);
  };

  const handlePin = async () => {
    const updated = await api.pinNote(id);
    setNote(updated);
  };

  const handleArchive = async () => {
    await api.archiveNote(id);
    router.push('/dashboard/notes');
  };

  const handleDelete = async () => {
    if (!confirm('Delete this note?')) return;
    await api.deleteNote(id);
    router.push('/dashboard/notes');
  };

  if (loading) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-gray-400 text-sm">Loading...</p>
      </div>
    );
  }

  if (!note) {
    return (
      <div className="max-w-3xl mx-auto py-12">
        <p className="text-gray-400">Note not found</p>
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto">
      {/* Top bar */}
      <div className="flex items-center justify-between mb-8">
        <button
          onClick={() => router.push('/dashboard/notes')}
          className="text-sm text-gray-400 hover:text-gray-600"
        >
          ← Back to notes
        </button>

        <div className="flex items-center gap-3">
          <button
            onClick={handlePin}
            className={`text-sm px-3 py-1 rounded-lg ${note.pinned ? 'bg-amber-50 text-amber-600' : 'text-gray-400 hover:text-gray-600'}`}
          >
            {note.pinned ? '★ Pinned' : '☆ Pin'}
          </button>
          <button
            onClick={handleArchive}
            className="text-sm text-gray-400 hover:text-gray-600"
          >
            {note.archivedAt ? 'Unarchive' : 'Archive'}
          </button>
          <button
            onClick={handleDelete}
            className="text-sm text-gray-400 hover:text-red-500"
          >
            Delete
          </button>
        </div>
      </div>

      {/* Title */}
      {editing ? (
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="w-full text-2xl font-bold text-gray-900 mb-4 px-0 py-2 border-b border-gray-200 focus:outline-none focus:border-gray-900"
          autoFocus
        />
      ) : (
        <h1
          className="text-2xl font-bold text-gray-900 mb-4 cursor-pointer hover:text-gray-700"
          onClick={() => setEditing(true)}
        >
          {note.title}
        </h1>
      )}

      {/* Meta */}
      <div className="flex items-center gap-3 mb-6 text-xs text-gray-400">
        <span>{new Date(note.createdAt).toLocaleString('en-IN', {
          weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
          hour: '2-digit', minute: '2-digit',
          timeZone: 'Asia/Kolkata', hour12: true,
        })}</span>
        {note.client && <span className="px-2 py-0.5 bg-gray-100 rounded-full">{note.client}</span>}
      </div>

      {/* Tags */}
      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-6">
          {note.tags.map(tag => (
            <span key={tag} className="px-2.5 py-1 bg-gray-100 text-gray-600 text-xs rounded-full">
              {tag}
            </span>
          ))}
        </div>
      )}

      {/* Body */}
      {editing ? (
        <div>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            className="w-full min-h-[300px] text-gray-700 text-sm leading-relaxed px-0 py-2 border-none focus:outline-none resize-none"
            placeholder="Write your note here..."
          />
          <div className="flex gap-3 mt-4 pt-4 border-t border-gray-100">
            <button
              onClick={handleSave}
              disabled={saving}
              className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800 disabled:opacity-50"
            >
              {saving ? 'Saving...' : 'Save'}
            </button>
            <button
              onClick={() => {
                setTitle(note.title);
                setBody(note.body || '');
                setEditing(false);
              }}
              className="px-4 py-2 text-gray-500 text-sm"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : (
        <div
          className="text-gray-700 text-sm leading-relaxed whitespace-pre-wrap min-h-[200px] cursor-pointer hover:bg-gray-50 rounded-lg p-2 -m-2"
          onClick={() => setEditing(true)}
        >
          {note.body || <span className="text-gray-300">Click to add content...</span>}
        </div>
      )}
    </div>
  );
}
