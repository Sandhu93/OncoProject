import type { Metadata } from 'next';

import AdminService from '@/services/api/admin.service';
import StaffService from '@/services/api/staff.service';

import AuditView, { AuditFilterForm } from '@/views/admin/AuditView';
import NoAccess from '@/views/admin/NoAccess';
import Pagination from '@/views/charts/Pagination';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Audit trail' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

const PAGE_SIZE = 50;

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

const first = (value: string | string[] | undefined) => (Array.isArray(value) ? value[0] : value) ?? '';

export default async function AuditPage({ searchParams }: { searchParams: SearchParams }) {
  const params = await searchParams;
  const filters = {
    rt: first(params.rt).trim().slice(0, 40),
    action: first(params.action).trim().slice(0, 80),
    person: first(params.person).trim().slice(0, 60),
    from: first(params.from).trim(),
    to: first(params.to).trim(),
  };
  const page = Math.max(Number.parseInt(first(params.page), 10) || 1, 1);

  const staff = await StaffService.me();
  const allowed = staff.capabilities.includes('VIEW_AUDIT');
  const list = allowed
    ? await AdminService.audit({
        rt: filters.rt || undefined,
        action: filters.action || undefined,
        person: filters.person || undefined,
        from: filters.from || undefined,
        to: filters.to || undefined,
        limit: PAGE_SIZE,
        offset: (page - 1) * PAGE_SIZE,
      })
    : null;

  const hrefForPage = (target: number) => {
    const next = new URLSearchParams();

    for (const [key, value] of Object.entries(filters)) if (value) next.set(key, value);
    if (target > 1) next.set('page', String(target));

    const query = next.toString();

    return query ? `/audit?${query}` : '/audit';
  };

  return (
    <main className="mx-auto flex min-h-screen max-w-5xl flex-col gap-6 p-8">
      <AppHeader current="audit" fullName={staff.fullName} capabilities={staff.capabilities} />

      <h1 className="text-2xl font-semibold">Audit trail</h1>

      {list ? (
        <>
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            Every change is recorded here with who made it and when. Entries cannot be edited or removed.
          </p>
          <AuditFilterForm filters={filters} actions={list.actions} />
          <AuditView list={list} />
          {list.total > 0 && (
            <Pagination page={page} pageSize={PAGE_SIZE} total={list.total} hrefForPage={hrefForPage} />
          )}
        </>
      ) : (
        <NoAccess what="read the audit trail" />
      )}
    </main>
  );
}
