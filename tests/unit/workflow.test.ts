import { describe, expect, it } from 'vitest';
import {
  evaluateTransition,
  type TransitionRequest,
  type WorkflowDefinition,
} from '@oncotrack/contracts';

// Synthetic approved fixture tests the engine; it is not a clinical workflow seed.
const definition: WorkflowDefinition = {
  status: 'ACTIVE',
  transitions: [
    {
      action: 'SUBMIT',
      from: 'TASK',
      to: 'REVIEW',
      role: 'JUNIOR_RESIDENT',
      requiresAssignment: true,
      requiresReason: false,
      prerequisites: ['SIMULATION_RECORDED'],
    },
  ],
};
const request: TransitionRequest = {
  action: 'SUBMIT',
  currentStage: 'TASK',
  currentVersion: 3,
  expectedVersion: 3,
  chartOpen: true,
  actor: { id: 'resident-a', active: true, roles: ['JUNIOR_RESIDENT'] },
  assignedStaffId: 'resident-a',
  completedPrerequisites: ['SIMULATION_RECORDED'],
};

describe('WF-001 transition policy', () => {
  it('accepts a permitted assigned handoff', () => {
    expect(evaluateTransition(definition, request)).toEqual({ allowed: true, nextStage: 'REVIEW' });
  });
  it.each(['DRAFT', 'RETIRED'] as const)('refuses a %s workflow', (status) => {
    expect(evaluateTransition({ ...definition, status }, request)).toEqual({
      allowed: false,
      code: 'WORKFLOW_NOT_ACTIVE',
    });
  });
  it.each([
    [{ assignedStaffId: 'resident-b' }, 'ACCESS_DENIED'],
    [{ actor: { ...request.actor, active: false } }, 'ACCESS_DENIED'],
    [{ actor: { ...request.actor, roles: ['RADIOGRAPHER'] } }, 'ACCESS_DENIED'],
    [{ expectedVersion: 2 }, 'VERSION_CONFLICT'],
    [{ chartOpen: false }, 'CHART_CLOSED'],
    [{ action: 'SKIP_REVIEW' }, 'INVALID_TRANSITION'],
    [{ completedPrerequisites: [] }, 'PREREQUISITES_MISSING'],
  ] as const)('rejects invalid context %j', (change, code) => {
    expect(evaluateTransition(definition, { ...request, ...change })).toEqual({
      allowed: false,
      code,
    });
  });
  it('requires a meaningful reason when the rule requires one', () => {
    const review: WorkflowDefinition = {
      status: 'ACTIVE',
      transitions: [{ ...definition.transitions[0]!, requiresReason: true }],
    };
    expect(evaluateTransition(review, { ...request, reason: '  ' })).toEqual({
      allowed: false,
      code: 'REASON_REQUIRED',
    });
    expect(evaluateTransition(review, { ...request, reason: 'Revision required' }).allowed).toBe(
      true,
    );
  });
});
