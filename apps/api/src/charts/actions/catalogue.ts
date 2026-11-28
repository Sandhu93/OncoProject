import {
  GIVE_SIMULATION_DATES,
  RECORD_CT_SIM_DONE,
  RECORD_MOULD_DONE,
} from './definitions/getting-ready.js';
import {
  APPROVE_CONTOURING,
  ASSIGN_CONTOURING,
  RETURN_CONTOURING,
  SUBMIT_CONTOURING,
  VERIFY_CONTOURING,
} from './definitions/contouring.js';
import type { ActionDefinition } from './types.js';

/**
 * One definition for every action in the proposed RT workflow, by the action code used in
 * database/seeds/rt-workflow-proposed.sql. A workflow action without a definition cannot be performed
 * (test ACT-001 lists any that are missing).
 */
export const CATALOGUE: Readonly<Record<string, ActionDefinition>> = {
  GIVE_SIMULATION_DATES,
  RECORD_MOULD_DONE,
  RECORD_CT_SIM_DONE,
  ASSIGN_CONTOURING,
  SUBMIT_CONTOURING,
  VERIFY_CONTOURING,
  APPROVE_CONTOURING,
  RETURN_CONTOURING,
};
