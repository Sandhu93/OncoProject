import type { StageInfo } from './types.js';

/**
 * What each stage of the proposed RT workflow is waiting for, who takes the next step and which phase it
 * belongs to. Worded as in the prototype. The stage codes are the stable identifiers in
 * database/seeds/rt-workflow-proposed.sql.
 */
export const STAGE_INFO: Readonly<Record<string, StageInfo>> = {
  RT_CHART_ISSUED: {
    phase: 'Getting ready',
    waiting: 'the radiographer to give mould and CT Sim dates',
    owner: 'RADIOGRAPHER',
  },
  SIMULATION_DATES_GIVEN: {
    phase: 'Getting ready',
    waiting: 'the patient to attend the mould appointment',
    owner: 'RADIOGRAPHER',
  },
  MOULD_DONE: {
    phase: 'Getting ready',
    waiting: 'the patient to attend CT simulation',
    owner: 'RADIOGRAPHER',
  },
  CT_SIM_DONE: {
    phase: 'Contouring',
    waiting: 'a junior resident to be assigned for contouring',
    owner: 'CONSULTANT',
  },
  CONTOURING: {
    phase: 'Contouring',
    waiting: 'the assigned junior resident to submit contouring',
    owner: 'JUNIOR_RESIDENT',
  },
  SENIOR_VERIFICATION: {
    phase: 'Contouring',
    waiting: 'the senior resident to verify the contouring',
    owner: 'SENIOR_RESIDENT',
  },
  CONSULTANT_CONTOUR_APPROVAL: {
    phase: 'Contouring',
    waiting: 'the consultant to approve the contouring',
    owner: 'CONSULTANT',
  },
  PHYSICS_PLANNING: {
    phase: 'Planning',
    waiting: 'the physicist to build and submit the plan',
    owner: 'PHYSICIST',
  },
  PLAN_APPROVAL: {
    phase: 'Planning',
    waiting: 'the consultant or treating doctor to approve the plan',
    owner: 'CONSULTANT',
  },
  PLAN_APPROVED: {
    phase: 'Planning',
    waiting: 'the approved plan to be sent to the LINAC',
    owner: 'PHYSICIST',
  },
  PLAN_ON_LINAC: {
    phase: 'Treatment',
    waiting: 'the radiographer to inform the patient',
    owner: 'RADIOGRAPHER',
  },
  PATIENT_INFORMED: {
    phase: 'Treatment',
    waiting: 'the patient to arrive and treatment to start',
    owner: 'JUNIOR_RESIDENT',
  },
  TREATMENT_IN_PROGRESS: {
    phase: 'Treatment',
    waiting: 'weekly updates, then completion',
    owner: 'JUNIOR_RESIDENT',
  },
  TREATMENT_COMPLETED: { phase: 'Treatment', waiting: 'nothing, tracking ends here', owner: null },
};
