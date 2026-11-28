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
  const members = allowed ? await AdminService.staff() : [];

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl flex-col gap-6 p-8">
      <AppHeader current="staff" fullName={staff.fullName} capabilities={staff.capabilities} />

      <h1 className="text-2xl font-semibold">Staff</h1>

      {allowed ? <StaffView members={members} youId={staff.id} /> : <NoAccess what="manage staff accounts" />}
    </main>
  );
}
