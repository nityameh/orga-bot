'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { api } from '@/lib/api';
import {
  ActivityIcon, BellIcon, ChartIcon, ChatIcon, HomeIcon, LogoutIcon, NoteIcon, PeopleIcon, SettingsIcon, TaskIcon,
} from '@/components/icons';

type NavItem = { href: string; label: string; icon: (p: { size?: number }) => React.ReactNode };

const SECTIONS: { title: string; items: NavItem[] }[] = [
  {
    title: 'Overview',
    items: [
      { href: '/dashboard', label: 'Home', icon: HomeIcon },
      { href: '/dashboard/chat', label: 'Chat', icon: ChatIcon },
      { href: '/dashboard/insights', label: 'Insights', icon: ChartIcon },
      { href: '/dashboard/activity', label: 'Activity', icon: ActivityIcon },
    ],
  },
  {
    title: 'Workspace',
    items: [
      { href: '/dashboard/notes', label: 'Notes', icon: NoteIcon },
      { href: '/dashboard/tasks', label: 'Tasks', icon: TaskIcon },
      { href: '/dashboard/reminders', label: 'Reminders', icon: BellIcon },
      { href: '/dashboard/clients', label: 'Clients', icon: PeopleIcon },
    ],
  },
];

const SETTINGS: NavItem = { href: '/dashboard/settings', label: 'Settings', icon: SettingsIcon };
export const ALL_NAV: NavItem[] = [...SECTIONS.flatMap((s) => s.items), SETTINGS];

export function isActive(pathname: string, href: string) {
  return pathname === href || (href !== '/dashboard' && pathname.startsWith(href));
}

export function Logo({ compact = false }: { compact?: boolean }) {
  return (
    <Link href="/dashboard" className="flex items-center gap-2.5">
      <span className="relative inline-flex h-8 w-8 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-sm font-bold text-white shadow-sm shadow-brand-600/30">
        O
        <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full bg-emerald-400 ring-2 ring-white" />
      </span>
      {!compact && <span className="text-[17px] font-semibold tracking-tight text-ink-900">Orga</span>}
    </Link>
  );
}

async function logout() {
  try {
    await api.logout();
  } finally {
    window.location.href = '/login';
  }
}

function NavLink({ item, active }: { item: NavItem; active: boolean }) {
  const Icon = item.icon;
  return (
    <Link
      href={item.href}
      aria-current={active ? 'page' : undefined}
      className={`group flex items-center gap-3 rounded-xl px-3 py-2 text-sm transition ${active
        ? 'bg-brand-50 font-medium text-brand-700'
        : 'text-ink-500 hover:bg-ink-100 hover:text-ink-900'}`}
    >
      <span className={active ? 'text-brand-600' : 'text-ink-400 group-hover:text-ink-700'}><Icon size={18} /></span>
      {item.label}
    </Link>
  );
}

export default function Sidebar() {
  const pathname = usePathname();

  return (
    <aside className="sticky top-0 hidden h-screen w-64 shrink-0 flex-col justify-between border-r border-ink-200/70 bg-white/80 px-4 py-5 backdrop-blur md:flex">
      <div>
        <div className="mb-8 px-2"><Logo /></div>
        <nav className="space-y-6">
          {SECTIONS.map((section) => (
            <div key={section.title}>
              <p className="eyebrow mb-2 px-3">{section.title}</p>
              <div className="space-y-0.5">
                {section.items.map((item) => <NavLink key={item.href} item={item} active={isActive(pathname, item.href)} />)}
              </div>
            </div>
          ))}
        </nav>
      </div>

      <div className="space-y-1 border-t border-ink-100 pt-4">
        <NavLink item={SETTINGS} active={isActive(pathname, SETTINGS.href)} />
        <button onClick={logout}
          className="flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-ink-500 transition hover:bg-ink-100 hover:text-ink-900">
          <span className="text-ink-400"><LogoutIcon size={18} /></span>
          Log out
        </button>
      </div>
    </aside>
  );
}

/** Compact top bar with scrollable tabs for small screens (the sidebar is hidden there). */
export function MobileNav() {
  const pathname = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-ink-200/70 bg-white/90 backdrop-blur md:hidden">
      <div className="flex items-center justify-between px-4 py-3">
        <Logo />
        <button onClick={logout} className="btn btn-ghost btn-sm" aria-label="Log out"><LogoutIcon size={16} /></button>
      </div>
      <nav className="flex gap-1 overflow-x-auto px-3 pb-2">
        {ALL_NAV.map((item) => {
          const active = isActive(pathname, item.href);
          return (
            <Link key={item.href} href={item.href}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-xs font-medium ${active ? 'bg-brand-50 text-brand-700' : 'text-ink-500'}`}>
              {item.label}
            </Link>
          );
        })}
      </nav>
    </header>
  );
}
