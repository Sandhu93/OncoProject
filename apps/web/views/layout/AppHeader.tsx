import Link from 'next/link';

interface AppHeaderProps {
  /** The page the user is on, so its link can be marked as current. */
  current: 'dashboard' | 'charts';
  fullName: string;
}

const NAV = [
  { key: 'dashboard', href: '/dashboard', label: 'Dashboard' },
  { key: 'charts', href: '/charts', label: 'Charts' },
] as const;

/** Navigation and logout for every signed-in page. */
export default function AppHeader({ current, fullName }: AppHeaderProps) {
  return (
    <header className="flex flex-wrap items-center justify-between gap-4 border-b border-zinc-200 pb-4 dark:border-zinc-800">
      <nav aria-label="Main" className="flex items-center gap-6">
        <span className="font-semibold">OncoTrack</span>
        {NAV.map(item => (
          <Link
            key={item.key}
            href={item.href}
            aria-current={current === item.key ? 'page' : undefined}
            className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
          >
            {item.label}
          </Link>
        ))}
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
