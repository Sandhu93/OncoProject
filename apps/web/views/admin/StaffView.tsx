import type { StaffMember } from '@oncotrack/contracts';

import { formatDateTime } from '@/utils/format';
import { CAPABILITY_LABELS, ROLE_LABELS } from '@/utils/labels';

import { CreateStaffForm, DeleteStaffForm, EditStaffForm, PasswordForm } from './StaffForms';

/** Everyone who can use OncoTrack, with the forms to change them. */
export default function StaffView({ members, youId }: { members: readonly StaffMember[]; youId: string }) {
  return (
    <>
      <p className="text-sm text-zinc-600 dark:text-zinc-400">
        Roles decide which steps a person can do. Extra access is for running the system. A switched-off account keeps
        its history but cannot sign in.
      </p>

      <ul aria-label="Staff" className="flex flex-col gap-3">
        {members.map(member => (
          <li key={member.id} className="rounded-md border border-zinc-200 p-4 dark:border-zinc-800">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="text-base font-semibold">{member.fullName}</h2>
              <span className="text-sm text-zinc-600 dark:text-zinc-400">{member.username}</span>
              {member.id === youId && <span className="text-sm">(you)</span>}
              {!member.isActive && (
                <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs font-semibold dark:bg-zinc-800">
                  Switched off
                </span>
              )}
              {member.isActive && !member.isAvailable && (
                <span className="rounded bg-amber-100 px-2 py-0.5 text-xs font-semibold text-amber-900 dark:bg-amber-950 dark:text-amber-200">
                  Not available
                </span>
              )}
            </div>
            <p className="mt-1 text-sm">
              {member.roles.length ? member.roles.map(role => ROLE_LABELS[role]).join(', ') : 'No role'}
              {member.capabilities.length > 0 && (
                <> · {member.capabilities.map(capability => CAPABILITY_LABELS[capability]).join(', ')}</>
              )}
            </p>
            <p className="text-sm text-zinc-600 dark:text-zinc-400">
              {member.lastLoginAt ? `Last signed in ${formatDateTime(member.lastLoginAt)}` : 'Has not signed in yet'}
            </p>

            <details className="mt-3">
              <summary className="cursor-pointer text-sm font-medium underline underline-offset-4">
                Change {member.fullName}
              </summary>
              <div className="mt-3 flex flex-col gap-6">
                <EditStaffForm member={member} isYou={member.id === youId} />
                <PasswordForm member={member} />
                {member.canDelete && member.id !== youId && <DeleteStaffForm member={member} />}
              </div>
            </details>
          </li>
        ))}
      </ul>

      <CreateStaffForm />
    </>
  );
}
