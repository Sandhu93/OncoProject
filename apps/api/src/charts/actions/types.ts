import type { ActionCheck, ActionField, ClinicalRole } from '@oncotrack/contracts';
import type { Actor } from '../../auth/actor.js';
import type { Queryable } from '../../database/database.service.js';
import type { FieldProblem } from '../../transactions/domain-error.js';

/** The chart's current facts: dates, times, short references. Never patient information. */
export type ChartData = Record<string, string>;

/** Everything a step may look at. Built inside the command's transaction. */
export interface ActionContext {
  /** Today in India Standard Time, YYYY-MM-DD. */
  today: string;
  actor: Actor;
  tx: Queryable;
  chart: {
    id: string;
    rtNumber: string;
    stage: string;
    plannedSessions: number | null;
    /** The day the chart was issued (India Standard Time). */
    issuedOn: string;
    data: ChartData;
  };
}

/** A form field plus the messages used when its limits are broken. */
export interface FieldDef extends ActionField {
  /** What to say when a required field is empty; otherwise "Enter <label>." */
  requiredMessage?: string;
  minMessage?: string;
  maxMessage?: string;
  /** Required only when this returns true (for example a note that is needed only if treatment ended early). */
  requiredWhen?: (values: Record<string, string>) => boolean;
}

export interface ActionDefinition {
  label: string;
  fields(context: ActionContext): FieldDef[];
  /** Rules that look at several fields, or at the chart. Return problems; do not throw. */
  validate?(
    values: Record<string, string>,
    context: ActionContext,
  ): Promise<FieldProblem[]> | FieldProblem[];
  /** One plain sentence for the history. */
  summary(values: Record<string, string>, context: ActionContext): string;
  /**
   * Extra facts worked out from what was submitted (for example the name of the chosen resident). They are kept
   * on the chart and can be used by `summary`.
   */
  derive?(values: Record<string, string>, context: ActionContext): Promise<Record<string, string>>;
  /** A fact set to today's date when the step is done (e.g. `datesGivenOn`). */
  stamp?: string;
  /** Facts a "send back" removes, so what depended on them has to be done again. */
  clear?: readonly string[];
  /** Conditions shown before the step (used by "tell the patient"). */
  checks?(context: ActionContext): ActionCheck[];
  /** Refuses with a DomainError when the chart is not ready for this step. */
  assertReady?(context: ActionContext): void;
  /** Writes outside the chart's own row (assignments, treatment updates). Runs in the same transaction. */
  afterApply?(values: Record<string, string>, context: ActionContext): Promise<void>;
  /** Short references that are also kept in the chart's own columns. */
  columns?(
    values: Record<string, string>,
  ): Partial<Record<'scan_reference' | 'contour_set_name' | 'plan_id', string | null>>;
}

export interface StageInfo {
  phase: 'Getting ready' | 'Contouring' | 'Planning' | 'Treatment';
  /** What the chart is waiting for, as the prototype words it. */
  waiting: string;
  /** The role that takes the next step; null when tracking ends. */
  owner: ClinicalRole | null;
}
