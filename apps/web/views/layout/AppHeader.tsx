import Link from 'next/link';

import type { StaffCapability } from '@oncotrack/contracts';

import NotificationBell from './NotificationBell';

interface AppHeaderProps {
  /** The page the user is on, so its link can be marked as current. */
  current:
    | 'dashboard'
    | 'overview'
    | 'calendar'
    | 'saturday'
    | 'stages'
    | 'charts'
    | 'workflow'
    | 'staff'
    | 'audit'
    | 'notifications';
  fullName: string;
  /** What the person may do beyond their role. Staff and Audit show only to those who hold them. */
  capabilities?: readonly StaffCapability[];
}

const NAV = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'overview', href: '/overview', label: 'Overview' },
  { key: 'calendar', href: '/calendar', label: 'Calendar' },
  { key: 'saturday', href: '/saturday', label: 'Saturday updates' },
  { key: 'stages', href: '/stages', label: 'Stages' },
  { key: 'charts', href: '/charts', label: 'Charts' },
  { key: 'workflow', href: '/workflow', label: 'Workflow' },
  { key: 'staff', href: '/staff', label: 'Staff', needs: 'MANAGE_STAFF' },
  { key: 'audit', href: '/audit', label: 'Audit', needs: 'VIEW_AUDIT' },
] as const satisfies readonly { key: string; href: string; label: string; needs?: StaffCapability }[];

/** Navigation and logout for every signed-in page. */
export default function AppHeader({ current, fullName, capabilities = [] }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <nav aria-label="Main" className="flex flex-wrap items-center gap-x-6 gap-y-2">
        <span className="font-semibold">OncoTrack</span>
        {NAV.filter(item => !('needs' in item) || capabilities.includes(item.needs)).map(item => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current === item.key ? 'page' : undefined}
            className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
          >
            {item.label}
          </Link>
        ))}
        <NotificationBell current={current === 'notifications'} />
      </nav>
      <div className="flex items-center gap-4">
        <span className="text-sm text-zinc-600 dark:text-zinc-400">{fullName}</span>
        <form method="post" action="/api/auth/clear">
          <button type="submit" className="font-medium underline underline-offset-4">
            Log out
          </button>
        </form>
      </div>
    </header>
  );
}
