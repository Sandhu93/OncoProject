import { CLINICAL_ROLES, STAFF_CAPABILITIES } from '@oncotrack/contracts';
import { describe, expect, it } from 'vitest';

import { CAPABILITY_LABELS, ROLE_LABELS } from './labels';

describe('labels', () => {
  it('names every role and capability the API can return', () => {
    expect(Object.keys(ROLE_LABELS).sort()).toEqual([...CLINICAL_ROLES].sort());
    expect(Object.keys(CAPABILITY_LABELS).sort()).toEqual([...STAFF_CAPABILITIES].sort());
  });
});
