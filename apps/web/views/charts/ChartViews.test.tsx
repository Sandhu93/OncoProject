import type { ChartDetail, ChartSummary } from '@oncotrack/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import AppHeader from '../layout/AppHeader';

import ChartDetailView from './ChartDetailView';
import ChartFilters from './ChartFilters';
import ChartTable from './ChartTable';
import Pagination from './Pagination';

const chart = (change: Partial<ChartSummary> = {}): ChartSummary => ({
  id: 'c1',
  rtNumber: 'RT/2026/001',
  stage: { code: 'CONTOURING', label: 'Contouring' },
  stageSince: '2026-11-27T19:34:00.000Z',
  minutesInStage: 185,
  status: 'OPEN',
  version: 1,
  plannedSessions: 25,
  priority: 'ROUTINE',
  planId: null,
  contourSetName: null,
  scanReference: null,
  phase: 'Contouring',
  waitingFor: 'a junior resident to submit the contours',
  ownerRole: 'JUNIOR_RESIDENT',
  issuedBy: 'Synthetic Consultant',
  createdAt: '2026-11-27T19:34:00.000Z',
  ...change,
});

vi.mock('@/app/charts/[rtNumber]/actions', () => ({ performAction: vi.fn() }));
vi.mock('@/app/charts/[rtNumber]/comment-actions', () => ({ postComment: vi.fn() }));
vi.mock('@/app/notifications/actions', () => ({ getUnreadCount: vi.fn(() => Promise.resolve(0)) }));

describe('ChartTable', () => {
  it('links each RT number to its chart, encoded', () => {
    render(<ChartTable charts={[chart()]} />);

    expect(screen.getByRole('link', { name: 'RT/2026/001' })).toHaveAttribute('href', '/charts/RT%2F2026%2F001');
  });

  it('shows the stage, how long it has waited, priority and planned sessions', () => {
    render(
      <ChartTable
        charts={[chart(), chart({ id: 'c2', rtNumber: 'RT-2', priority: 'URGENT', plannedSessions: null })]}
      />,
    );

    const [, first, second] = screen.getAllByRole('row');

    expect(within(first!).getByText('Contouring')).toBeInTheDocument();
    expect(within(first!).getByText('3 h 5 min')).toBeInTheDocument();
    expect(within(first!).getByText('Routine')).toBeInTheDocument();
    expect(within(first!).getByText('25')).toBeInTheDocument();
    expect(within(second!).getByText('Urgent')).toBeInTheDocument();
    expect(within(second!).getByText('—')).toBeInTheDocument();
  });

  it('says when a chart is closed or discontinued', () => {
    render(
      <ChartTable
        charts={[chart({ status: 'CLOSED' }), chart({ id: 'c2', rtNumber: 'RT-2', status: 'DISCONTINUED' })]}
      />,
    );

    expect(screen.getByText('(closed)')).toBeInTheDocument();
    expect(screen.getByText('(discontinued)')).toBeInTheDocument();
  });
});

describe('ChartFilters', () => {
  it('is a search form that sends the RT number and status in the address', () => {
    render(<ChartFilters q="RT-1" status="CLOSED" />);

    expect(screen.getByRole('search')).toHaveAttribute('method', 'get');
    expect(screen.getByRole('search')).toHaveAttribute('action', '/charts');
    expect(screen.getByLabelText('RT number')).toHaveValue('RT-1');
    expect(screen.getByLabelText('Status')).toHaveValue('CLOSED');
  });
});

describe('Pagination', () => {
  const href = (page: number) => `/charts?page=${page}`;

  it('shows the range and both links in the middle', () => {
    render(<Pagination page={2} pageSize={25} total={80} hrefForPage={href} />);

    expect(screen.getByText('Showing 26–50 of 80')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous' })).toHaveAttribute('href', '/charts?page=1');
    expect(screen.getByRole('link', { name: 'Next' })).toHaveAttribute('href', '/charts?page=3');
  });

  it('has no Next on the last page and no Previous on the first', () => {
    const { rerender } = render(<Pagination page={1} pageSize={25} total={25} hrefForPage={href} />);

    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Previous' })).not.toBeInTheDocument();

    rerender(<Pagination page={4} pageSize={25} total={80} hrefForPage={href} />);

    expect(screen.getByText('Showing 76–80 of 80')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Next' })).not.toBeInTheDocument();
  });
});

describe('ChartDetailView', () => {
  const detail: ChartDetail = {
    ...chart({ planId: 'PLAN-7' }),
    recorded: [{ label: 'Mould done', value: '1 Dec 2026' }],
    weekly: null,
    availableActions: [],
    controls: [],
    comments: [
      {
        id: 'k1',
        kind: 'COMMENT',
        body: 'Is the CT slot confirmed?',
        authorName: 'Dr Asha Rao',
        authorRoles: ['JUNIOR_RESIDENT'],
        forRole: 'RADIOGRAPHER',
        stageLabel: 'Contouring',
        createdAt: '2026-11-27T19:40:00.000Z',
      },
      {
        id: 'k2',
        kind: 'HANDOFF',
        body: 'Morning slots only.',
        authorName: 'Radiographer One',
        authorRoles: ['RADIOGRAPHER'],
        forRole: null,
        stageLabel: 'Dates given',
        createdAt: '2026-11-27T19:50:00.000Z',
      },
    ],
    history: [
      {
        action: 'ISSUE_CHART',
        fromStage: null,
        fromStageLabel: null,
        toStage: 'CONTOURING',
        toStageLabel: 'Contouring',
        actorName: 'Synthetic Consultant',
        actorRoles: ['CONSULTANT'],
        reason: null,
        summary: null,
        occurredAt: '2026-11-27T19:34:00.000Z',
      },
    ],
  };

  it('shows the details, with a dash for what was left empty', () => {
    render(<ChartDetailView chart={detail} />);

    expect(screen.getByRole('heading', { level: 1, name: 'RT/2026/001' })).toBeInTheDocument();
    expect(screen.getByText('PLAN-7')).toBeInTheDocument();
    expect(screen.getAllByText('—')).toHaveLength(2);
    expect(screen.getByText(/Contouring for 3 h 5 min/)).toBeInTheDocument();
  });

  it('shows the discussion, oldest first, with who it was for and handoff notes marked', () => {
    render(<ChartDetailView chart={detail} />);

    const items = within(screen.getByRole('list', { name: 'Comments, oldest first' })).getAllByRole('listitem');

    expect(items).toHaveLength(2);
    expect(items[0]).toHaveTextContent('Dr Asha Rao');
    expect(items[0]).toHaveTextContent('for Radiographer');
    expect(items[0]).toHaveTextContent('Is the CT slot confirmed?');
    expect(items[1]).toHaveTextContent('note when passing the chart on');
    expect(screen.getByRole('form', { name: 'Add a comment' })).toBeInTheDocument();
  });

  it('says so when there are no comments', () => {
    render(<ChartDetailView chart={{ ...detail, comments: [] }} />);

    expect(screen.getByText('No comments yet.')).toBeInTheDocument();
  });

  it('lists the history in India Standard Time', () => {
    render(<ChartDetailView chart={detail} />);

    const row = screen.getAllByRole('row')[1]!;

    expect(within(row).getByText('Chart issued')).toBeInTheDocument();
    expect(within(row).getByText(/28 Nov 2026/)).toBeInTheDocument();
    expect(within(row).getByText('Synthetic Consultant')).toBeInTheDocument();
  });
});

describe('AppHeader', () => {
  it('marks the current page and offers logout', () => {
    render(<AppHeader current="charts" fullName="Synthetic Consultant" />);

    expect(screen.getByRole('link', { name: 'Charts' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('link', { name: 'Dashboard' })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: 'Log out' })).toBeInTheDocument();
    expect(screen.getByText('Synthetic Consultant')).toBeInTheDocument();
  });
});
