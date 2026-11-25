'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import { Note } from '@/lib/types';
import { Tag, formatIST } from '@/components/ui';
import { ArchiveIcon, ArrowLeftIcon, ClockIcon, EditIcon, PinIcon, TrashIcon } from '@/components/icons';

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
      <div className="mx-auto max-w-3xl" aria-busy="true" aria-label="Loading">
        <div className="skeleton mb-8 h-8 w-32" />
        <div className="skeleton h-96 rounded-2xl" />
      </div>
    );
  }

  if (!note) {
    return <div className="mx-auto max-w-3xl py-12"><p className="text-ink-400">Note not found</p></div>;
  }

  return (
    <div className="mx-auto max-w-3xl">
      {/* Top bar */}
      <div className="mb-6 flex items-center justify-between gap-3">
        <button onClick={() => router.push('/dashboard/notes')} className="btn btn-ghost btn-sm -ml-3">
          <ArrowLeftIcon size={14} /> Notes
        </button>

        <div className="flex items-center gap-1">
          <button onClick={handlePin}
            className={`btn btn-sm ${note.pinned ? 'bg-amber-50 text-amber-600 ring-1 ring-amber-200' : 'btn-ghost'}`}>
            <PinIcon size={14} /> {note.pinned ? 'Pinned' : 'Pin'}
          </button>
          {!editing && <button onClick={() => setEditing(true)} className="btn btn-ghost btn-sm"><EditIcon size={14} /> Edit</button>}
          <button onClick={handleArchive} className="btn btn-ghost btn-sm">
            <ArchiveIcon size={14} /> {note.archivedAt ? 'Unarchive' : 'Archive'}
          </button>
          <button onClick={handleDelete} className="btn btn-danger btn-sm"><TrashIcon size={14} /> Delete</button>
        </div>
      </div>

      <article className="card px-8 py-8 sm:px-10 animate-fade-up">
        {/* Title */}
        {editing ? (
          <input type="text" value={title} onChange={(e) => setTitle(e.target.value)} aria-label="Title"
            className="mb-4 w-full border-b border-ink-200 bg-transparent py-2 text-3xl font-semibold tracking-tight text-ink-900 focus:border-brand-500 focus:outline-none"
            autoFocus />
        ) : (
          <h1 className="mb-4 cursor-text text-3xl font-semibold tracking-tight text-ink-900" onClick={() => setEditing(true)}>
            {note.title}
          </h1>
        )}

        {/* Meta */}
        <div className="mb-6 flex flex-wrap items-center gap-2 text-xs text-ink-400">
          <span className="flex items-center gap-1.5"><ClockIcon size={13} /> {formatIST(note.createdAt, { year: 'numeric' })}</span>
          {note.client && <span className="chip capitalize">{note.client}</span>}
          {note.tags.map(tag => <Tag key={tag}>{tag}</Tag>)}
        </div>

        <div className="border-t border-ink-100 pt-6">
          {editing ? (
            <div>
              <textarea value={body} onChange={(e) => setBody(e.target.value)} aria-label="Note body"
                className="min-h-[300px] w-full resize-none bg-transparent text-[15px] leading-relaxed text-ink-700 focus:outline-none"
                placeholder="Write your note here..." />
              <div className="mt-4 flex gap-2 border-t border-ink-100 pt-4">
                <button onClick={handleSave} disabled={saving} className="btn btn-primary">{saving ? 'Saving…' : 'Save changes'}</button>
                <button onClick={() => { setTitle(note.title); setBody(note.body || ''); setEditing(false); }} className="btn btn-ghost">Cancel</button>
              </div>
            </div>
          ) : (
            <div className="-m-3 min-h-[200px] cursor-text whitespace-pre-wrap rounded-xl p-3 text-[15px] leading-relaxed text-ink-700 transition hover:bg-ink-50"
              onClick={() => setEditing(true)}>
              {note.body || <span className="text-ink-300">Click to add content…</span>}
            </div>
          )}
        </div>
      </article>
    </div>
  );
}
