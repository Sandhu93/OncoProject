import type { AuditList, StaffMember, WorkflowView as Workflow } from '@oncotrack/contracts';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';

import AppHeader from '@/views/layout/AppHeader';
import { createStaff, deleteStaff, setStaffPassword, updateStaff } from '@/app/staff/actions';

import AuditView, { actionLabel } from './AuditView';
import NoAccess from './NoAccess';
import StaffView from './StaffView';
import WorkflowView from './WorkflowView';

vi.mock('@/app/staff/actions', () => ({
  createStaff: vi.fn(),
  updateStaff: vi.fn(),
  setStaffPassword: vi.fn(),
  deleteStaff: vi.fn(),
}));
vi.mock('@/app/notifications/actions', () => ({ getUnreadCount: vi.fn(() => Promise.resolve(0)) }));

const member = (change: Partial<StaffMember>): StaffMember => ({
  id: 'id-1',
  username: 'dr.rao',
  fullName: 'Dr Rao',
  roles: ['JUNIOR_RESIDENT'],
  capabilities: [],
  isActive: true,
  isAvailable: true,
  createdAt: '2026-11-01T05:30:00.000Z',
  lastLoginAt: null,
  canDelete: false,
  ...change,
});

describe('AppHeader permissions', () => {
  it('shows Workflow to everyone, and Staff and Audit only to those who hold them', () => {
    const { rerender } = render(<AppHeader current="charts" fullName="Dr Rao" />);

    expect(screen.getByRole('link', { name: 'Workflow' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();

    rerender(<AppHeader current="staff" fullName="Dr Rao" capabilities={['MANAGE_STAFF']} />);
    expect(screen.getByRole('link', { name: 'Staff' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Audit' })).not.toBeInTheDocument();

    rerender(<AppHeader current="audit" fullName="Dr Rao" capabilities={['VIEW_AUDIT']} />);
    expect(screen.getByRole('link', { name: 'Audit' })).toHaveAttribute('aria-current', 'page');
    expect(screen.queryByRole('link', { name: 'Staff' })).not.toBeInTheDocument();
  });
});

describe('StaffView', () => {
  const members = [
    member({
      id: 'me',
      username: 'admin',
      fullName: 'Admin Person',
      roles: ['CONSULTANT'],
      capabilities: ['MANAGE_STAFF'],
    }),
    member({ id: 'off', username: 'gone', fullName: 'Gone Person', isActive: false }),
    member({
      id: 'leave',
      username: 'away',
      fullName: 'Away Person',
      isAvailable: false,
      lastLoginAt: '2026-11-27T08:00:00.000Z',
    }),
  ];

  it('lists each account with roles, access, state and last sign-in', () => {
    render(<StaffView members={members} youId="me" />);

    const rows = within(screen.getByRole('list', { name: 'Staff' })).getAllByRole('listitem');

    expect(rows).toHaveLength(3);
    expect(rows[0]).toHaveTextContent('Admin Person');
    expect(rows[0]).toHaveTextContent('(you)');
    expect(rows[0]).toHaveTextContent('Consultant · Manage staff');
    expect(rows[0]).toHaveTextContent('Has not signed in yet');
    expect(rows[1]).toHaveTextContent('Switched off');
    expect(rows[2]).toHaveTextContent('Not available');
    expect(rows[2]).toHaveTextContent('Last signed in');
  });

  it('will not offer to switch your own account off', () => {
    render(<StaffView members={members} youId="me" />);

    const own = screen.getByRole('form', { name: 'Edit Admin Person' });

    expect(within(own).getByRole('checkbox', { name: /Can sign in/ })).toBeDisabled();
    expect(
      within(screen.getByRole('form', { name: 'Edit Gone Person' })).getByRole('checkbox', { name: /Can sign in/ }),
    ).toBeEnabled();
  });

  it('sends the new account as typed, and keeps the typing when it is refused', async () => {
    vi.mocked(createStaff).mockResolvedValue({
      message: 'Some fields need attention.',
      fieldErrors: { password: ['Use at least 12 characters.'] },
      values: { username: 'new.one', fullName: 'New One', roles: ['PHYSICIST'], capabilities: [] },
    });
    render(<StaffView members={members} youId="me" />);

    const form = screen.getByRole('form', { name: 'Add an account' });
    const user = userEvent.setup();

    await user.type(within(form).getByRole('textbox', { name: 'Full name' }), 'New One');
    await user.type(within(form).getByRole('textbox', { name: 'Username' }), 'new.one');
    await user.type(within(form).getByLabelText('First password'), 'short');
    await user.click(within(form).getByRole('checkbox', { name: 'Physicist' }));
    await user.click(within(form).getByRole('button', { name: 'Add account' }));

    const sent = vi.mocked(createStaff).mock.calls[0]![1];

    expect(sent.get('username')).toBe('new.one');
    expect(sent.getAll('roles')).toEqual(['PHYSICIST']);
    expect(await within(form).findByText('Use at least 12 characters.')).toBeInTheDocument();
    expect(within(form).getByRole('alert')).toHaveTextContent('Some fields need attention.');
    expect(within(form).getByRole('textbox', { name: 'Username' })).toHaveValue('new.one');
  });

  it('saves changes and a new password for one account', async () => {
    vi.mocked(updateStaff).mockResolvedValue({ done: 'Saved.' });
    vi.mocked(setStaffPassword).mockResolvedValue({ done: 'Password set. They have been signed out.' });
    render(<StaffView members={members} youId="me" />);

    const user = userEvent.setup();
    const edit = screen.getByRole('form', { name: 'Edit Away Person' });

    await user.click(within(edit).getByRole('checkbox', { name: /Available for new work/ }));
    await user.click(within(edit).getByRole('button', { name: 'Save changes' }));

    const changed = vi.mocked(updateStaff).mock.calls[0]![1];

    expect(changed.get('id')).toBe('leave');
    expect(changed.get('isAvailable')).toBe('on');
    expect(await within(edit).findByText('Saved.')).toBeInTheDocument();

    const password = screen.getByRole('form', { name: 'New password for Away Person' });

    await user.type(within(password).getByLabelText('New password'), 'a long enough passphrase');
    await user.click(within(password).getByRole('button', { name: 'Set password' }));
    expect(vi.mocked(setStaffPassword).mock.calls[0]![1].get('id')).toBe('leave');
    // A saved password clears the form, which is remounted, so look it up again.
    const saved = await screen.findByRole('form', { name: 'New password for Away Person' });

    expect(await within(saved).findByText(/Password set/)).toBeInTheDocument();
    expect(within(saved).getByLabelText('New password')).toHaveValue('');
  });
});

describe('deleting an account', () => {
  it('is offered only for an account with no history, never your own, and sends the id', async () => {
    vi.mocked(deleteStaff).mockResolvedValue({ done: 'Deleted.' });
    render(
      <StaffView
        members={[
          member({ id: 'me', fullName: 'Admin Person', canDelete: true }),
          member({ id: 'new', fullName: 'Never Used', canDelete: true }),
          member({ id: 'used', fullName: 'Has History', canDelete: false }),
        ]}
        youId="me"
      />,
    );

    expect(screen.queryByRole('form', { name: 'Delete Admin Person' })).not.toBeInTheDocument();
    expect(screen.queryByRole('form', { name: 'Delete Has History' })).not.toBeInTheDocument();

    const form = screen.getByRole('form', { name: 'Delete Never Used' });

    await userEvent.setup().click(within(form).getByRole('button', { name: 'Delete this account' }));
    expect(vi.mocked(deleteStaff).mock.calls[0]![1].get('id')).toBe('new');
    expect(await within(form).findByText('Deleted.')).toBeInTheDocument();
  });
});

describe('WorkflowView', () => {
  const workflow: Workflow = {
    code: 'RT',
    version: 2,
    label: 'RT workflow',
    status: 'ACTIVE',
    approvedBy: 'Dr Boss',
    approvedAt: '2026-11-01T05:30:00.000Z',
    stages: [
      {
        code: 'A',
        label: 'Start',
        phase: 'Getting ready',
        position: 1,
        isInitial: true,
        isTerminal: false,
        weeklyUpdateRoles: [],
      },
      {
        code: 'B',
        label: 'End',
        phase: 'Finished',
        position: 2,
        isInitial: false,
        isTerminal: true,
        weeklyUpdateRoles: ['RADIOGRAPHER'],
      },
    ],
    transitions: [
      {
        from: 'A',
        fromLabel: 'Start',
        action: 'GO',
        actionLabel: 'Go on',
        role: 'PHYSICIST',
        to: 'B',
        toLabel: 'End',
        requiresReason: true,
        requiresAssignment: true,
      },
    ],
  };

  it('shows who approved it, each stage and each step', () => {
    render(<WorkflowView workflow={workflow} />);

    expect(screen.getByText(/RT workflow, version 2/)).toHaveTextContent('Approved by Dr Boss');

    const stages = within(screen.getByRole('list', { name: 'Stages' })).getAllByRole('heading');

    expect(stages.map(heading => heading.textContent)).toEqual(['1. Start', '2. End']);
    expect(screen.getByText('Go on')).toBeInTheDocument();
    expect(
      screen.getByText(/by Physicist → End \(a reason is needed\) \(only the person it is assigned to\)/),
    ).toBeInTheDocument();
    expect(screen.getByText(/Where tracking ends · Saturday update: Radiographer/)).toBeInTheDocument();
    expect(screen.getByText('No further steps.')).toBeInTheDocument();
  });

  it('says so when nothing is approved', () => {
    render(<WorkflowView workflow={null} />);

    expect(screen.getByRole('status')).toHaveTextContent('No workflow has been approved yet.');
  });
});

describe('AuditView', () => {
  const list: AuditList = {
    total: 2,
    actions: ['CHART_ISSUED'],
    items: [
      {
        id: '2',
        occurredAt: '2026-11-28T05:30:00.000Z',
        action: 'STAFF_PASSWORD_RESET',
        entityType: 'STAFF_USER',
        entityId: 'x',
        rtNumber: null,
        actorName: 'Admin Person',
        actorRoles: ['CONSULTANT'],
        before: null,
        after: { username: 'dr.rao' },
      },
      {
        id: '1',
        occurredAt: '2026-11-28T04:30:00.000Z',
        action: 'LOGIN_FAILED',
        entityType: 'STAFF_USER',
        entityId: 'y',
        rtNumber: 'RT/7',
        actorName: null,
        actorRoles: [],
        before: null,
        after: null,
      },
    ],
  };

  it('reads an action name as words', () => {
    expect(actionLabel('STAFF_PASSWORD_RESET')).toBe('Staff password reset');
  });

  it('shows who did what, links the chart, and tucks the values away', () => {
    render(<AuditView list={list} />);

    const [reset, failed] = within(screen.getByRole('list', { name: 'Audit trail' })).getAllByRole('listitem');

    expect(reset).toHaveTextContent('Staff password reset');
    expect(reset).toHaveTextContent('Admin Person (consultant)');
    expect(within(reset!).getByText('Values')).toBeInTheDocument();
    expect(reset).toHaveTextContent('"username": "dr.rao"');
    expect(failed).toHaveTextContent('The system');
    expect(within(failed!).getByRole('link', { name: 'RT/7' })).toHaveAttribute('href', '/charts/RT%2F7');
    // Nothing recorded, so nothing to open.
    expect(within(failed!).queryByText('Values')).not.toBeInTheDocument();
  });

  it('says so when nothing matches', () => {
    render(<AuditView list={{ items: [], total: 0, actions: [] }} />);

    expect(screen.getByRole('status')).toHaveTextContent('Nothing in the audit trail matches this search.');
  });
});

describe('NoAccess', () => {
  it('explains, and points to who can help', () => {
    render(<NoAccess what="manage staff accounts" />);

    expect(screen.getByRole('alert')).toHaveTextContent('You do not have permission to manage staff accounts');
  });
});
