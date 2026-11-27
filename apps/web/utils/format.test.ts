import { describe, expect, it } from 'vitest';

import { formatDateTime, formatDuration } from './format';

describe('formatDuration', () => {
  it.each([
    [0, '0 min'],
    [59, '59 min'],
    [60, '1 h'],
    [65, '1 h 5 min'],
    [23 * 60 + 59, '23 h 59 min'],
    [24 * 60, '1 d'],
    [2 * 24 * 60 + 4 * 60 + 30, '2 d 4 h'],
    [-5, '0 min'],
    [12.9, '12 min'],
  ])('%s minutes is "%s"', (minutes, expected) => {
    expect(formatDuration(minutes)).toBe(expected);
  });
});

describe('formatDateTime', () => {
  it('uses India Standard Time whatever the server zone', () => {
    // 19:34 UTC is 01:04 the next day in India (UTC+5:30).
    expect(formatDateTime('2026-11-27T19:34:00.000Z')).toMatch(/28 Nov 2026/);
    expect(formatDateTime('2026-11-27T19:34:00.000Z')).toMatch(/1:04/);
  });
});
