'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Note } from '@/lib/types';

export default function NotesPage() {
  const [notes, setNotes] = useState<Note[]>([]);
  const [total, setTotal] = useState(0);
  const [search, setSearch] = useState('');
  const [showArchived, setShowArchived] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editBody, setEditBody] = useState('');
  const [loading, setLoading] = useState(true);
  const [showNewForm, setShowNewForm] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newBody, setNewBody] = useState('');
  const [newTags, setNewTags] = useState('');

  const loadNotes = useCallback(async () => {
    setLoading(true);
    const params: Record<string, string> = { limit: '50' };
    if (search) params.search = search;
    if (showArchived) params.archived = 'true';
    const data = await api.getNotes(params);
    setNotes(data.notes);
    setTotal(data.total);
    setLoading(false);
  }, [search, showArchived]);

  useEffect(() => { loadNotes(); }, [loadNotes]);

  // Debounced search
  const [searchInput, setSearchInput] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setSearch(searchInput), 300);
    return () => clearTimeout(timer);
  }, [searchInput]);

  const handlePin = async (id: string) => {
    await api.pinNote(id);
    loadNotes();
  };

  const handleArchive = async (id: string) => {
    await api.archiveNote(id);
    loadNotes();
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this note?')) return;
    await api.deleteNote(id);
    loadNotes();
  };

  const startEdit = (note: Note) => {
    setEditingId(note.id);
    setEditTitle(note.title);
    setEditBody(note.body || '');
  };

  const saveEdit = async () => {
    if (!editingId) return;
    await api.updateNote(editingId, { title: editTitle, body: editBody });
    setEditingId(null);
    loadNotes();
  };

  const cancelEdit = () => setEditingId(null);

  const handleCreateNote = async () => {
    if (!newTitle.trim()) return;
    const tags = newTags.split(',').map(t => t.trim()).filter(Boolean).map(t => t.startsWith('#') ? t : `#${t}`);
    await api.createNote({ title: newTitle.trim(), body: newBody.trim() || null, tags });
    setNewTitle(''); setNewBody(''); setNewTags('');
    setShowNewForm(false);
    loadNotes();
  };

  const pinnedNotes = notes.filter(n => n.pinned);
  const unpinnedNotes = notes.filter(n => !n.pinned);

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-xl font-bold text-gray-900">Notes ({total})</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 text-sm text-gray-500">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
              className="rounded"
            />
            Show archived
          </label>
          <button
            onClick={() => setShowNewForm(!showNewForm)}
            className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800"
          >
            + New Note
          </button>
        </div>
      </div>

      {showNewForm && (
        <div className="bg-white border border-gray-200 rounded-xl p-4 mb-6">
          <input
            type="text"
            placeholder="Title"
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            className="w-full font-medium text-sm mb-2 px-3 py-2 border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-gray-900"
            autoFocus
          />
          <textarea
            placeholder="Body (optional)"
            value={newBody}
            onChange={(e) => setNewBody(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-2 resize-none focus:outline-none focus:ring-2 focus:ring-gray-900"
            rows={3}
          />
          <input
            type="text"
            placeholder="Tags (comma separated, e.g. acme, design)"
            value={newTags}
            onChange={(e) => setNewTags(e.target.value)}
            className="w-full text-sm px-3 py-2 border border-gray-200 rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-gray-900"
          />
          <div className="flex gap-2">
            <button onClick={handleCreateNote} className="px-4 py-2 bg-gray-900 text-white text-sm rounded-lg hover:bg-gray-800">Save</button>
            <button onClick={() => setShowNewForm(false)} className="px-4 py-2 text-gray-500 text-sm">Cancel</button>
          </div>
        </div>
      )}

      <input
        type="text"
        placeholder="Search notes..."
        value={searchInput}
        onChange={(e) => setSearchInput(e.target.value)}
        className="w-full max-w-md px-4 py-2 border border-gray-200 rounded-lg text-sm mb-6 focus:outline-none focus:ring-2 focus:ring-gray-900"
      />

      {loading ? (
        <p className="text-gray-400 text-sm">Loading...</p>
      ) : notes.length === 0 ? (
        <div className="text-center py-16 text-gray-400">
          <p className="text-lg mb-2">No notes yet</p>
          <p className="text-sm">Send a message to Orga on WhatsApp to create your first note.</p>
        </div>
      ) : (
        <>
          {pinnedNotes.length > 0 && (
            <div className="mb-6">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wide mb-3">Pinned</p>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                {pinnedNotes.map(note => (
                  <NoteCard
                    key={note.id}
                    note={note}
                    isEditing={editingId === note.id}
                    editTitle={editTitle}
                    editBody={editBody}
                    onEditTitle={setEditTitle}
                    onEditBody={setEditBody}
                    onPin={handlePin}
                    onArchive={handleArchive}
                    onDelete={handleDelete}
                    onStartEdit={startEdit}
                    onSaveEdit={saveEdit}
                    onCancelEdit={cancelEdit}
                  />
                ))}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {unpinnedNotes.map(note => (
              <NoteCard
                key={note.id}
                note={note}
                isEditing={editingId === note.id}
                editTitle={editTitle}
                editBody={editBody}
                onEditTitle={setEditTitle}
                onEditBody={setEditBody}
                onPin={handlePin}
                onArchive={handleArchive}
                onDelete={handleDelete}
                onStartEdit={startEdit}
                onSaveEdit={saveEdit}
                onCancelEdit={cancelEdit}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

function NoteCard({
  note, isEditing, editTitle, editBody,
  onEditTitle, onEditBody,
  onPin, onArchive, onDelete, onStartEdit, onSaveEdit, onCancelEdit,
}: {
  note: Note;
  isEditing: boolean;
  editTitle: string;
  editBody: string;
  onEditTitle: (v: string) => void;
  onEditBody: (v: string) => void;
  onPin: (id: string) => void;
  onArchive: (id: string) => void;
  onDelete: (id: string) => void;
  onStartEdit: (note: Note) => void;
  onSaveEdit: () => void;
  onCancelEdit: () => void;
}) {
  const age = timeAgo(note.createdAt);

  if (isEditing) {
    return (
      <div className="bg-white border-2 border-gray-900 rounded-xl p-4">
        <input
          type="text"
          value={editTitle}
          onChange={(e) => onEditTitle(e.target.value)}
          className="w-full font-medium text-sm mb-2 px-2 py-1 border border-gray-200 rounded"
          autoFocus
        />
        <textarea
          value={editBody}
          onChange={(e) => onEditBody(e.target.value)}
          className="w-full text-sm text-gray-600 px-2 py-1 border border-gray-200 rounded resize-none"
          rows={3}
        />
        <div className="flex gap-2 mt-3">
          <button onClick={onSaveEdit} className="px-3 py-1 bg-gray-900 text-white text-xs rounded-lg">Save</button>
          <button onClick={onCancelEdit} className="px-3 py-1 text-gray-500 text-xs">Cancel</button>
        </div>
      </div>
    );
  }

  const router = useRouter();

  return (
    <div
      className={`bg-white border border-gray-200 rounded-xl p-4 hover:shadow-sm transition-shadow cursor-pointer ${note.archivedAt ? 'opacity-60' : ''}`}
      onClick={() => router.push(`/dashboard/notes/${note.id}`)}
    >
      <div className="flex items-start justify-between mb-2">
        <h3 className="font-medium text-sm text-gray-900 flex-1">{note.title}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onPin(note.id); }}
          className={`text-xs ml-2 ${note.pinned ? 'text-amber-500' : 'text-gray-300 hover:text-gray-500'}`}
          title={note.pinned ? 'Unpin' : 'Pin'}
        >
          ★
        </button>
      </div>

      {note.body && note.body !== note.title && (
        <p className="text-xs text-gray-500 mb-3 line-clamp-2">{note.body}</p>
      )}

      {note.tags.length > 0 && (
        <div className="flex flex-wrap gap-1 mb-3">
          {note.tags.map(tag => (
            <span key={tag} className="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">{tag}</span>
          ))}
        </div>
      )}

      <div className="flex items-center justify-between text-xs text-gray-400">
        <span>{note.client && `${note.client} · `}{age}</span>
        <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onStartEdit(note)} className="hover:text-gray-700">edit</button>
          <button onClick={() => onArchive(note.id)} className="hover:text-gray-700">
            {note.archivedAt ? 'unarchive' : 'archive'}
          </button>
          <button onClick={() => onDelete(note.id)} className="hover:text-red-500">delete</button>
        </div>
      </div>
    </div>
  );
}

function timeAgo(dateStr: string): string {
  const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
  if (seconds < 604800) return `${Math.floor(seconds / 86400)}d ago`;
  return new Date(dateStr).toLocaleDateString('en-IN');
}
