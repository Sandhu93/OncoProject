import { describe, expect, it, vi } from 'vitest';

import { handleRequest } from './base.service';
import ChartService from './chart.service';

vi.mock('./base.service', () => ({ handleRequest: vi.fn() }));

const summary = {
  id: 'c1',
  rtNumber: 'RT-1',
  stage: { code: 'CONTOURING', label: 'Contouring' },
  stageSince: '2026-11-28T00:00:00.000Z',
  minutesInStage: 5,
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
  createdAt: '2026-11-28T00:00:00.000Z',
};

const parserOf = () => vi.mocked(handleRequest).mock.calls[0]![1]!.parse!;

describe('ChartService.list', () => {
  it('sends the search as query parameters with the token', async () => {
    await ChartService.list({ q: 'RT-1', status: 'OPEN', limit: 25, offset: 0 });

    expect(handleRequest).toHaveBeenCalledWith('/charts', {
      requiresAuth: true,
      query: { q: 'RT-1', status: 'OPEN', limit: 25, offset: 0 },
      parse: expect.any(Function),
    });
  });

  it('accepts the API shape and rejects a malformed one', async () => {
    await ChartService.list({});

    expect(parserOf()({ items: [summary], total: 1 })).toEqual({ items: [summary], total: 1 });
    expect(() => parserOf()({ items: [{ ...summary, priority: 'MAYBE' }], total: 1 })).toThrow();
    expect(() => parserOf()({ items: [] })).toThrow();
  });
});

describe('ChartService.find', () => {
  it('encodes the RT number, which may contain a slash', async () => {
    await ChartService.find('RT/2026/001');

    expect(vi.mocked(handleRequest).mock.calls[0]![0]).toBe('/charts/by-number/RT%2F2026%2F001');
  });

  it('requires the history as well', async () => {
    await ChartService.find('RT-1');

    expect(() => parserOf()(summary)).toThrow();
    expect(
      parserOf()({
        ...summary,
        recorded: [],
        availableActions: [],
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
            occurredAt: '2026-11-28T00:00:00.000Z',
          },
        ],
      }),
    ).toMatchObject({ rtNumber: 'RT-1' });
  });
});

describe('ChartService.perform', () => {
  it('posts the step with the expected version and the idempotency key, encoding the RT number', async () => {
    await ChartService.perform(
      'RT/1',
      'GIVE_SIMULATION_DATES',
      { expectedVersion: 3, values: { mouldDate: 'x' } },
      'k-1',
    );

    expect(handleRequest).toHaveBeenCalledWith('/charts/by-number/RT%2F1/actions/GIVE_SIMULATION_DATES', {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': 'k-1' },
      body: JSON.stringify({ expectedVersion: 3, values: { mouldDate: 'x' } }),
      parse: expect.any(Function),
    });
  });

  it('reads the available steps and their fields from the answer', async () => {
    await ChartService.perform('RT-1', 'X', { expectedVersion: 1, values: {} }, 'k');

    const field = { key: 'mouldDate', label: 'Mould date', type: 'date', required: true, default: '2030-01-02' };
    const parsed = parserOf()({
      ...summary,
      recorded: [{ label: 'Mould done', value: '1 Dec 2026' }],
      availableActions: [{ action: 'A', label: 'Do A', requiresReason: false, fields: [field], checks: [] }],
      history: [],
    }) as { availableActions: { fields: unknown[] }[] };

    expect(parsed.availableActions[0]!.fields).toEqual([field]);
    expect(() => parserOf()({ ...summary, recorded: [], availableActions: [{ action: 'A' }], history: [] })).toThrow();
  });
});

describe('ChartService.issue', () => {
  it('posts the chart with the idempotency key', async () => {
    await ChartService.issue({ rtNumber: 'RT-1', plannedSessions: 25 }, 'key-1');

    expect(handleRequest).toHaveBeenCalledWith('/charts', {
      requiresAuth: true,
      method: 'POST',
      headers: { 'Idempotency-Key': 'key-1' },
      body: JSON.stringify({ rtNumber: 'RT-1', plannedSessions: 25 }),
      parse: expect.any(Function),
    });
  });
});
