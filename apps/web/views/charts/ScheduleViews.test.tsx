import type { Calendar, ChartQueue, QueueItem, StageSummary } from '@oncotrack/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { formatWeekday, shiftDay } from '@/utils/format';

import CalendarView from './CalendarView';
import SaturdayView from './SaturdayView';
import StageMapView from './StageMapView';

const stage = { code: 'SIMULATION_DATES_GIVEN', label: 'Dates given' };

const calendar: Calendar = {
  today: '2026-11-28',
  from: '2026-11-28',
  to: '2026-11-30',
  late: [{ rtNumber: 'RT-LATE', kind: 'MOULD', date: '2026-11-26', time: '09:00', resource: null, done: false, stage }],
  days: [
    { date: '2026-11-28', entries: [] },
    { date: '2026-11-29', entries: [] },
    {
      date: '2026-11-30',
      entries: [
        { rtNumber: 'RT-1', kind: 'CT_SIM', date: '2026-11-30', time: '11:30', resource: null, done: true, stage },
        {
          rtNumber: 'RT/2',
          kind: 'FIRST_TREATMENT',
          date: '2026-11-30',
          time: '15:00',
          resource: 'LINAC 2',
          done: false,
          stage,
        },
      ],
    },
  ],
};

describe('day helpers', () => {
  it('moves a plain day across month and year ends', () => {
    expect(shiftDay('2026-12-30', 3)).toBe('2027-01-02');
    expect(shiftDay('2026-03-01', -1)).toBe('2026-02-28');
  });

  it('writes the weekday without a comma', () => {
    expect(formatWeekday('2026-11-28')).toBe('Sat 28 Nov');
  });
});

describe('CalendarView', () => {
  it('lists each day, with what is booked and what is done, and says when nothing is', () => {
    render(<CalendarView calendar={calendar} />);

    const days = within(screen.getByRole('list', { name: 'Days' })).getAllByRole('listitem', {
      name: /^[A-Z][a-z]{2} \d/,
    });

    expect(days).toHaveLength(3);
    expect(days[0]).toHaveTextContent('(today)');
    expect(days[0]).toHaveTextContent('Nothing booked.');

    const last = within(days[2]!);

    expect(last.getByRole('link', { name: 'RT-1' })).toHaveAttribute('href', '/charts/RT-1');
    expect(last.getByText(/Done · Dates given/)).toBeVisible();
    expect(last.getByRole('link', { name: 'RT/2' })).toHaveAttribute('href', '/charts/RT%2F2');
    expect(last.getByText('LINAC 2')).toBeVisible();
    expect(last.getByText('15:00')).toBeVisible();
  });

  it('shows past appointments that were never recorded as done, with their date', () => {
    render(<CalendarView calendar={calendar} />);

    const late = screen.getByRole('region', { name: 'Not recorded as done' });

    expect(within(late).getByRole('link', { name: 'RT-LATE' })).toBeVisible();
    expect(within(late).getByText('Thu 26 Nov')).toBeVisible();
  });

  it('has no late section when nothing is late, and moves by the length of the window', () => {
    render(<CalendarView calendar={{ ...calendar, late: [] }} />);

    expect(screen.queryByRole('region', { name: 'Not recorded as done' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Previous 3 days' })).toHaveAttribute('href', '/calendar?from=2026-11-25');
    expect(screen.getByRole('link', { name: 'Next 3 days' })).toHaveAttribute('href', '/calendar?from=2026-12-01');
    expect(screen.getByRole('link', { name: 'Today' })).toHaveAttribute('href', '/calendar');
    expect(screen.getByText(/2 appointments/)).toBeVisible();
  });
});

const item = (change: Partial<QueueItem>): QueueItem => ({
  rtNumber: 'RT-T',
  priority: 'ROUTINE',
  stage: { code: 'TREATMENT_IN_PROGRESS', label: 'Treatment in progress' },
  phase: 'Treatment',
  stageNumber: 13,
  stageCount: 15,
  daysInStage: 5,
  stalled: false,
  needsYou: false,
  nextStep: null,
  waitingOn: 'Junior resident',
  assignedTo: null,
  assignedToYou: false,
  dateLine: null,
  treatmentDay: 5,
  sessionsDone: 4,
  plannedSessions: 25,
  weeklyMissing: [],
  ...change,
});

const queue = (items: QueueItem[]): ChartQueue => ({
  stallDays: 3,
  weekEnding: '2026-11-28',
  items,
  stages: [],
  totals: { open: items.length, gettingReady: 0, stalled: 0, inTreatment: items.length, saturdayUpdatesToCome: 0 },
});

describe('SaturdayView', () => {
  it('shows who has posted on each chart in treatment, and which are yours to post', () => {
    render(
      <SaturdayView
        queue={queue([
          item({ rtNumber: 'RT-A', weeklyMissing: ['RADIOGRAPHER'], needsYou: true }),
          item({ rtNumber: 'RT-B', weeklyMissing: ['JUNIOR_RESIDENT', 'RADIOGRAPHER'] }),
          item({ rtNumber: 'RT-C' }),
        ])}
      />,
    );

    expect(screen.getByText(/3 updates are still to come/)).toBeVisible();

    const rowA = screen.getByRole('row', { name: /RT-A/ });

    expect(
      within(rowA)
        .getAllByRole('cell')
        .map(cell => cell.textContent),
    ).toEqual(['4 of 25', 'Posted', 'Not yet', 'Yours to post']);
    expect(screen.getByRole('row', { name: /RT-C/ })).not.toHaveTextContent('Not yet');
    expect(screen.getByRole('row', { name: /RT-B/ })).not.toHaveTextContent('Posted');
  });

  it('says so when every update is in, and lists charts owed final updates', () => {
    render(
      <SaturdayView
        queue={queue([
          item({ rtNumber: 'RT-C' }),
          item({
            rtNumber: 'RT-F',
            stage: { code: 'TREATMENT_COMPLETED', label: 'Treatment completed' },
            waitingOn: 'Radiographer (final update)',
            needsYou: true,
          }),
        ])}
      />,
    );

    expect(screen.getByText(/every Saturday update is in/)).toBeVisible();

    const finishing = screen.getByRole('region', { name: 'Treatment finished, final updates owed' });

    expect(within(finishing).getByRole('link', { name: 'RT-F' })).toBeVisible();
    expect(finishing).toHaveTextContent('waiting on Radiographer (final update)');
    expect(finishing).toHaveTextContent('yours to post');
  });

  it('says so when no chart is in treatment', () => {
    render(<SaturdayView queue={queue([])} />);

    expect(screen.getByText('No chart is in treatment.')).toBeVisible();
    expect(screen.getByText('None.')).toBeVisible();
  });
});

const summary = (change: Partial<StageSummary>): StageSummary => ({
  code: 'X',
  label: 'Stage X',
  phase: 'Getting ready',
  position: 1,
  open: 0,
  stalled: 0,
  charts: [],
  ...change,
});

describe('StageMapView', () => {
  it('groups the stages by phase in order, with counts and links to the charts', () => {
    render(
      <StageMapView
        stages={[
          summary({ code: 'A', label: 'RT chart issued', position: 1, open: 2, stalled: 1, charts: ['RT-1', 'RT-2'] }),
          summary({ code: 'B', label: 'Dates given', position: 2 }),
          summary({
            code: 'C',
            label: 'Contouring',
            position: 3,
            phase: 'Contouring and planning',
            open: 1,
            charts: ['RT-3'],
          }),
        ]}
      />,
    );

    expect(screen.getAllByRole('heading', { level: 2 }).map(h => h.textContent)).toEqual([
      'Getting ready',
      'Contouring and planning',
    ]);

    const issued = screen.getByRole('listitem', { name: 'RT chart issued' });

    expect(issued).toHaveTextContent('2 open');
    expect(issued).toHaveTextContent('1 stalled');
    expect(within(issued).getByRole('link', { name: 'RT-2' })).toHaveAttribute('href', '/charts/RT-2');
    expect(screen.getByRole('listitem', { name: 'Dates given' })).toHaveTextContent('0 open');
  });

  it('says so when no workflow is active', () => {
    render(<StageMapView stages={[]} />);

    expect(screen.getByRole('status')).toHaveTextContent('No workflow is active yet.');
  });
});
