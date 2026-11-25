'use client';

import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Note } from '@/lib/types';
import { EmptyState, PageHeader, SkeletonCards, Tag, timeAgo } from '@/components/ui';
import { ArchiveIcon, EditIcon, NoteIcon, PinIcon, PlusIcon, SearchIcon, TrashIcon } from '@/components/icons';

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

  const cardProps = {
    editTitle, editBody,
    onEditTitle: setEditTitle, onEditBody: setEditBody,
    onPin: handlePin, onArchive: handleArchive, onDelete: handleDelete,
    onStartEdit: startEdit, onSaveEdit: saveEdit, onCancelEdit: cancelEdit,
  };

  return (
    <div>
      <PageHeader
        title="Notes"
        subtitle={`${total} ${total === 1 ? 'note' : 'notes'} saved from your chats`}
        actions={
          <button onClick={() => setShowNewForm(!showNewForm)} className="btn btn-primary">
            <PlusIcon size={16} /> New note
          </button>
        }
      />

      {showNewForm && (
        <div className="card mb-6 space-y-3 p-5 animate-fade-up">
          <input type="text" placeholder="Title" value={newTitle} onChange={(e) => setNewTitle(e.target.value)}
            className="input font-medium" autoFocus />
          <textarea placeholder="Body (optional)" value={newBody} onChange={(e) => setNewBody(e.target.value)}
            className="input resize-none" rows={3} />
          <input type="text" placeholder="Tags (comma separated, e.g. acme, design)" value={newTags}
            onChange={(e) => setNewTags(e.target.value)} className="input" />
          <div className="flex gap-2 pt-1">
            <button onClick={handleCreateNote} className="btn btn-primary">Save note</button>
            <button onClick={() => setShowNewForm(false)} className="btn btn-ghost">Cancel</button>
          </div>
        </div>
      )}

      <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative w-full max-w-md">
          <span className="pointer-events-none absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-400"><SearchIcon size={16} /></span>
          <input type="text" placeholder="Search notes…" value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)} className="input pl-10" aria-label="Search notes" />
        </div>
        <label className="flex cursor-pointer select-none items-center gap-2.5 text-sm text-ink-500">
          <span className="relative inline-flex">
            <input type="checkbox" checked={showArchived} onChange={(e) => setShowArchived(e.target.checked)} className="peer sr-only" />
            <span className="h-5 w-9 rounded-full bg-ink-200 transition peer-checked:bg-brand-600" />
            <span className="absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-white shadow transition peer-checked:translate-x-4" />
          </span>
          Show archived
        </label>
      </div>

      {loading ? (
        <SkeletonCards count={6} height="h-40" />
      ) : notes.length === 0 ? (
        <EmptyState icon={<NoteIcon size={18} />} title={search ? 'No notes match your search' : 'No notes yet'}
          hint={search ? 'Try a different word or a client name.' : 'Send a message to Orga on WhatsApp to create your first note.'} />
      ) : (
        <div className="space-y-8 animate-fade-up">
          {pinnedNotes.length > 0 && (
            <div>
              <p className="eyebrow mb-3 flex items-center gap-1.5"><PinIcon size={12} /> Pinned</p>
              <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
                {pinnedNotes.map(note => <NoteCard key={note.id} note={note} isEditing={editingId === note.id} {...cardProps} />)}
              </div>
            </div>
          )}
          <div>
            {pinnedNotes.length > 0 && <p className="eyebrow mb-3">Others</p>}
            <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
              {unpinnedNotes.map(note => <NoteCard key={note.id} note={note} isEditing={editingId === note.id} {...cardProps} />)}
            </div>
          </div>
        </div>
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
  // Hooks must run on every render, so this sits above the early return below.
  const router = useRouter();

  if (isEditing) {
    return (
      <div className="card space-y-2 p-4 ring-2 ring-brand-500">
        <input type="text" value={editTitle} onChange={(e) => onEditTitle(e.target.value)} className="input font-medium" autoFocus />
        <textarea value={editBody} onChange={(e) => onEditBody(e.target.value)} className="input resize-none" rows={4} />
        <div className="flex gap-2 pt-1">
          <button onClick={onSaveEdit} className="btn btn-primary btn-sm">Save</button>
          <button onClick={onCancelEdit} className="btn btn-ghost btn-sm">Cancel</button>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`card card-hover group flex cursor-pointer flex-col p-5 ${note.archivedAt ? 'opacity-60' : ''}`}
      onClick={() => router.push(`/dashboard/notes/${note.id}`)}
    >
      <div className="mb-2 flex items-start justify-between gap-3">
        <h3 className="line-clamp-2 flex-1 text-[15px] font-semibold leading-snug text-ink-900">{note.title}</h3>
        <button
          onClick={(e) => { e.stopPropagation(); onPin(note.id); }}
          className={`rounded-lg p-1.5 transition ${note.pinned ? 'bg-amber-50 text-amber-500' : 'text-ink-300 opacity-0 hover:bg-ink-100 hover:text-ink-600 group-hover:opacity-100'}`}
          title={note.pinned ? 'Unpin' : 'Pin'} aria-label={note.pinned ? 'Unpin note' : 'Pin note'}
        >
          <PinIcon size={15} />
        </button>
      </div>

      {note.body && note.body !== note.title && (
        <p className="mb-4 line-clamp-3 text-sm leading-relaxed text-ink-500">{note.body}</p>
      )}

      {note.tags.length > 0 && (
        <div className="mb-4 flex flex-wrap gap-1.5">{note.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}</div>
      )}

      <div className="mt-auto flex items-center justify-between border-t border-ink-100 pt-3 text-xs text-ink-400">
        <span className="truncate">{note.client && <span className="font-medium capitalize text-ink-600">{note.client} · </span>}{timeAgo(note.createdAt)}</span>
        <div className="flex gap-0.5 opacity-0 transition group-hover:opacity-100" onClick={(e) => e.stopPropagation()}>
          <button onClick={() => onStartEdit(note)} className="btn btn-ghost btn-sm p-1.5" title="Edit" aria-label="Edit note"><EditIcon size={14} /></button>
          <button onClick={() => onArchive(note.id)} className="btn btn-ghost btn-sm p-1.5"
            title={note.archivedAt ? 'Unarchive' : 'Archive'} aria-label={note.archivedAt ? 'Unarchive note' : 'Archive note'}><ArchiveIcon size={14} /></button>
          <button onClick={() => onDelete(note.id)} className="btn btn-danger btn-sm p-1.5" title="Delete" aria-label="Delete note"><TrashIcon size={14} /></button>
        </div>
      </div>
    </div>
  );
}
