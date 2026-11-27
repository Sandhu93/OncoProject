import type { Metadata } from 'next';

import { CAPABILITY_LABELS, ROLE_LABELS } from '@/utils/labels';

import StaffService from '@/services/api/staff.service';

export const metadata: Metadata = {
  title: 'Dashboard',
};

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

/**
 * Behind login: `/dashboard` is in PROTECTED_ROUTES (constants/routes.ts). What this page shows comes
 * from the API, which reads roles and capabilities from its own records: nothing is chosen in the browser.
 */
export default async function DashboardPage() {
  const staff = await StaffService.me();

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <header className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <form method="post" action="/api/auth/clear">
          <button type="submit" className="font-medium underline underline-offset-4">
            Log out
          </button>
        </form>
      </header>

      <section aria-labelledby="signed-in" className="flex flex-col gap-2">
        <h2 id="signed-in" className="text-lg font-medium">
          Signed in as {staff.fullName}
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Username <span className="font-mono">{staff.username}</span>
        </p>
        <p>
          <span className="font-medium">Roles: </span>
          {staff.roles.length > 0 ? staff.roles.map(role => ROLE_LABELS[role]).join(', ') : 'none assigned'}
        </p>
        {staff.capabilities.length > 0 && (
          <p>
            <span className="font-medium">Also allowed to: </span>
            {staff.capabilities.map(capability => CAPABILITY_LABELS[capability]).join(', ')}
          </p>
        )}
      </section>

      <p className="text-zinc-600 dark:text-zinc-400">
        Chart queues and handoffs are not built yet. OncoTrack holds no patient names or other patient information: a
        chart is identified by its RT number only.
      </p>
    </main>
  );
}
