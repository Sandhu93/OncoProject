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
      className="underline-offset-4 hover:underline aria-[current=page]:font-semibold aria-[current=page]:underline"
    >
      Inbox
      {unread ? (
        <span
          className="ml-1 rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white"
          aria-label={`${unread} unread`}
        >
          {unread}
        </span>
      ) : null}
    </Link>
  );
}
