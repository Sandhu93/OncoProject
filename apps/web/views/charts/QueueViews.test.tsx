import type { QueueItem } from '@oncotrack/contracts';
import { render, screen, within } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { ageText, matchesFilter, overviewOrder, queueSummary } from './queue';
import { ElsewhereList, KpiTiles, NeedsYouList, OverviewTable } from './QueueViews';

const item = (change: Partial<QueueItem> = {}): QueueItem => ({
  rtNumber: 'RT/1',
  priority: 'ROUTINE',
  stage: { code: 'CONTOURING', label: 'Contouring' },
  phase: 'Contouring',
  stageNumber: 5,
  stageCount: 14,
  daysInStage: 2,
  stalled: false,
  needsYou: true,
  nextStep: 'Submit contouring',
  waitingOn: 'Junior resident Dr Asha Rao',
  assignedTo: 'Dr Asha Rao',
  assignedToYou: true,
  dateLine: 'Contouring due 3 Dec 2026',
  treatmentDay: null,
  sessionsDone: null,
  plannedSessions: 25,
  weeklyMissing: [],
  ...change,
});

describe('queue wording', () => {
  it('says how long a chart has been in its stage, or the treatment day', () => {
    expect(ageText(item({ daysInStage: 0 }))).toBe('Just moved');
    expect(ageText(item({ daysInStage: 1 }))).toBe('1 day here');
    expect(ageText(item({ daysInStage: 4 }))).toBe('4 days here');
    expect(ageText(item({ treatmentDay: 9, daysInStage: 9 }))).toBe('Treatment day 9');
  });

  it('summarises the queue', () => {
    expect(queueSummary(0, 0, 3)).toBe('Nothing needs you right now.');
    expect(queueSummary(1, 0, 3)).toBe('1 chart needs you.');
    expect(queueSummary(4, 1, 3)).toBe('4 charts need you, and 1 has been waiting more than 3 days.');
    expect(queueSummary(4, 2, 5)).toBe('4 charts need you, and 2 have been waiting more than 5 days.');
  });

  it('filters and orders the overview', () => {
    const treatment = item({
      stage: { code: 'TREATMENT_IN_PROGRESS', label: 'Treatment in progress' },
      stageNumber: 13,
    });
    const stalled = item({ rtNumber: 'RT/2', stalled: true, stageNumber: 2 });

    expect(matchesFilter(treatment, 'in-treatment')).toBe(true);
    expect(matchesFilter(treatment, 'getting-ready')).toBe(false);
    expect(matchesFilter(stalled, 'stalled')).toBe(true);
    expect(matchesFilter(item(), 'stalled')).toBe(false);
    expect(matchesFilter(item(), 'all')).toBe(true);
    expect([stalled, treatment, item()].sort(overviewOrder).map(i => i.rtNumber)).toEqual(['RT/1', 'RT/1', 'RT/2']);
  });
});

describe('NeedsYouList', () => {
  it('shows what to do, where the chart is, who it is assigned to and the date', () => {
    render(<NeedsYouList items={[item({ priority: 'URGENT', stalled: true, daysInStage: 5 })]} />);

    const row = screen.getByRole('listitem');

    expect(within(row).getByRole('link', { name: 'Open RT/1' })).toHaveAttribute('href', '/charts/RT%2F1');
    expect(within(row).getByText('RT/1')).toBeVisible();
    expect(within(row).getByText('Submit contouring')).toBeVisible();
    expect(within(row).getByText('Urgent')).toBeVisible();
    expect(within(row).getByText('Stalled')).toBeVisible();
    expect(row).toHaveTextContent('5 days here · Assigned to you · Contouring due 3 Dec 2026');
  });

  it('names the resident when the chart is assigned to someone else', () => {
    render(<NeedsYouList items={[item({ assignedToYou: false })]} />);

    expect(screen.getByRole('listitem')).toHaveTextContent('Assigned to Dr Asha Rao');
  });
});

describe('ElsewhereList and OverviewTable', () => {
  it('lists who each chart is waiting on', () => {
    render(<ElsewhereList items={[item({ needsYou: false })]} />);

    const row = screen.getByRole('row', { name: /RT\/1/ });

    expect(row).toHaveTextContent('Junior resident Dr Asha Rao');
  });

  it('draws a progress bar from the stage position', () => {
    render(<OverviewTable items={[item()]} />);

    expect(screen.getByRole('progressbar', { name: 'Stage 5 of 14' })).toHaveAttribute('value', '5');
    expect(screen.getByText('Contouring due 3 Dec 2026')).toBeVisible();
  });

  it('shows the four tiles', () => {
    render(
      <KpiTiles stallDays={3} totals={{ gettingReady: 6, stalled: 2, inTreatment: 3, saturdayUpdatesToCome: 4 }} />,
    );

    expect(screen.getByText('Stalled over 3 days').previousSibling).toHaveTextContent('2');
    expect(screen.getByText('Saturday updates to come').previousSibling).toHaveTextContent('4');
  });
});
