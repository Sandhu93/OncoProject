'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

import { getUnreadCount } from '@/app/notifications/actions';

/** How often the header asks whether there is something new. */
const POLL_MS = 30_000;

/** The inbox link with a count of unread notifications, refreshed while the page is open. */
export default function NotificationBell({
  pollMs = POLL_MS,
  current = false,
}: {
  pollMs?: number;
  current?: boolean;
}) {
  const [unread, setUnread] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    const refresh = () => {
      if (document.visibilityState === 'hidden') return;

      getUnreadCount()
        .then(count => active && setUnread(count))
        .catch(() => undefined);
    };

    refresh();

    const timer = window.setInterval(refresh, pollMs);

    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [pollMs]);

  return (
    <Link
      href="/notifications"
      aria-current={current ? 'page' : undefined}
      className="relative inline-flex h-11 w-11 items-center justify-center rounded-lg text-foreground hover:bg-brand-soft aria-[current=page]:bg-brand-soft"
    >
      <svg
        width="22"
        height="22"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        <path d="M6 9a6 6 0 1 1 12 0c0 6 2 7 2 7H4s2-1 2-7" />
        <path d="M10 20a2 2 0 0 0 4 0" />
      </svg>
      <span className="sr-only">Inbox</span>
      {unread ? (
        <span
          className="absolute right-1 top-1 min-w-[1.125rem] rounded-full bg-danger px-1 text-center text-xs font-bold leading-[1.125rem] text-white"
          aria-label={`${unread} unread`}
        >
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
