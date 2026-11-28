import type { Metadata } from 'next';

import AdminService from '@/services/api/admin.service';
import StaffService from '@/services/api/staff.service';

import NoAccess from '@/views/admin/NoAccess';
import StaffView from '@/views/admin/StaffView';
import AppHeader from '@/views/layout/AppHeader';

export const metadata: Metadata = { title: 'Staff' };

// Per-user and read from the API: never prerendered at build time.
export const dynamic = 'force-dynamic';

export default async function StaffPage() {
  const staff = await StaffService.me();
  const allowed = staff.capabilities.includes('MANAGE_STAFF');
  const { items: members, directoryEnabled } = allowed
    ? await AdminService.staff()
    : { items: [], directoryEnabled: false };

  return (
    <>
      <AppHeader current="staff" fullName={staff.fullName} capabilities={staff.capabilities} />
      <main id="main" className="mx-auto flex min-h-screen w-full max-w-3xl flex-col gap-6 px-4 py-5 sm:p-8">
        <h1 className="text-2xl font-semibold">Staff</h1>

        {allowed ? (
          <StaffView members={members} youId={staff.id} directoryEnabled={directoryEnabled} />
        ) : (
          <NoAccess what="manage staff accounts" />
        )}
      </main>
    </>
  );
}
