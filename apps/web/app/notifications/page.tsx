import Link from 'next/link';

import type { Metadata } from 'next';

import NotificationService from '@/services/api/notification.service';
import StaffService from '@/services/api/staff.service';

import { chartHref } from '@/views/charts/ChartTable';
import AppHeader from '@/views/layout/AppHeader';
import AutoRefresh from '@/views/layout/AutoRefresh';

import { markAllRead, markRead } from './actions';

export const metadata: Metadata = { title: 'Inbox' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

const KIND_LABELS: Record<string, string> = {
  YOUR_TURN: 'Your turn',
  ASSIGNED: 'Assigned to you',
  SENT_BACK: 'Sent back',
  STALLED: 'Waiting too long',
  WEEKLY_DUE: 'Saturday update',
  COMMENT: 'Comment',
  FINISHED: 'Finished',
};

const when = (iso: string) =>
  new Intl.DateTimeFormat('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: 'numeric',
    month: 'short',
    hour: 'numeric',
    minute: '2-digit',
  }).format(new Date(iso));

export default async function NotificationsPage() {
  const [staff, inbox] = await Promise.all([StaffService.me(), NotificationService.list()]);

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <AppHeader current="notifications" fullName={staff.fullName} />
      <AutoRefresh />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold">Inbox</h1>
        {inbox.unread > 0 && (
          <form action={markAllRead}>
            <button type="submit" className="font-medium underline underline-offset-4">
              Mark all as read
            </button>
          </form>
        )}
      </div>

      <p role="status">{inbox.unread === 0 ? 'Nothing new.' : `${inbox.unread} unread.`}</p>

      {inbox.items.length === 0 ? (
        <p>When a chart reaches you, is sent back to you or has waited too long, you will be told here.</p>
      ) : (
        <ul className="flex flex-col gap-3" aria-label="Notifications">
          {inbox.items.map(item => (
            <li
              key={item.id}
              className={`rounded-md border p-4 ${item.readAt ? 'border-zinc-200 dark:border-zinc-800' : 'border-zinc-900 dark:border-zinc-100'}`}
            >
              <div className="flex flex-wrap items-center gap-3">
                <span className="text-sm font-semibold">{KIND_LABELS[item.kind] ?? item.kind}</span>
                {!item.readAt && (
                  <span className="rounded bg-red-100 px-2 py-0.5 text-xs font-semibold text-red-900 dark:bg-red-950 dark:text-red-200">
                    New
                  </span>
                )}
                <span className="ml-auto text-sm text-zinc-600 dark:text-zinc-400">{when(item.createdAt)}</span>
              </div>
              <p className="mt-2">{item.message}</p>
              <div className="mt-2 flex gap-4 text-sm">
                {item.rtNumber && (
                  <Link href={chartHref(item.rtNumber)} className="font-medium underline underline-offset-4">
                    Open {item.rtNumber}
                  </Link>
                )}
                {!item.readAt && (
                  <form action={markRead}>
                    <input type="hidden" name="id" value={item.id} />
                    <button type="submit" className="underline underline-offset-4">
                      Mark as read
                    </button>
                  </form>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
