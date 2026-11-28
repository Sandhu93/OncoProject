import { addDays, formatDate, formatWhen, skipSunday } from '../dates.js';
import { area, date, heading, text, time } from '../fields.js';
import type { ActionDefinition } from '../types.js';

const note = (values: Record<string, string>, key: string) =>
  values[key] ? ` Note: ${values[key]}` : '';

/** Radiographer, stage "RT chart issued": book the mould and CT Sim appointments. */
export const GIVE_SIMULATION_DATES: ActionDefinition = {
  label: 'Give mould and CT Sim dates',
  stamp: 'datesGivenOn',
  fields: ({ today }) => [
    heading('Mould appointment'),
    date('mouldDate', 'Mould date', {
      required: true,
      min: today,
      minMessage: 'Choose today or a later date.',
      default: skipSunday(addDays(today, 1)),
    }),
    time('mouldTime', 'Mould time', { required: true, default: '10:00' }),
    heading('CT Sim appointment'),
    date('ctDate', 'CT Sim date', {
      required: true,
      min: today,
      minMessage: 'Choose today or a later date.',
      default: skipSunday(addDays(today, 3)),
    }),
    time('ctTime', 'CT Sim time', { required: true, default: '11:00' }),
    area('bookNote', 'What the patient must do or bring first', {
      placeholder: 'For example: come with a full bladder.',
    }),
  ],
  validate: (values) =>
    values.mouldDate && values.ctDate && values.ctDate < values.mouldDate
      ? [{ field: 'ctDate', message: 'CT Sim cannot be before the mould date.' }]
      : [],
  summary: (v) =>
    `Mould booked for ${formatWhen(v.mouldDate!, v.mouldTime!)}. CT Sim booked for ${formatWhen(v.ctDate!, v.ctTime!)}.${note(v, 'bookNote')}`,
};

/** Radiographer, stage "Dates given": the mould has been made. */
export const RECORD_MOULD_DONE: ActionDefinition = {
  label: 'Record mould done',
  fields: ({ today, chart }) => [
    date('mouldDoneOn', 'Date the mould was made', {
      required: true,
      min: chart.issuedOn,
      minMessage: 'This date is before the chart was issued.',
      max: today,
      maxMessage: 'This date is in the future.',
      default: today,
    }),
    area('mouldNote', 'Note', { placeholder: 'For example: remade because it did not fit.' }),
  ],
  summary: (v) => `Mould done on ${formatDate(v.mouldDoneOn!)}.${note(v, 'mouldNote')}`,
};

/** Radiographer, stage "Mould done": the CT simulation has been done. */
export const RECORD_CT_SIM_DONE: ActionDefinition = {
  label: 'Record CT Sim done',
  fields: ({ today, chart }) => [
    date('ctDoneOn', 'Date of the CT Sim', {
      required: true,
      min: chart.data.mouldDoneOn ?? chart.issuedOn,
      minMessage: 'CT Sim cannot be before the mould.',
      max: today,
      maxMessage: 'This date is in the future.',
      default: today,
    }),
    text('ctRef', 'Scan reference', {
      maxLength: 30,
      help: 'Where to find the scan in the planning system. We do not store images.',
    }),
    area('ctNote', 'Note'),
  ],
  columns: (v) => (v.ctRef ? { scan_reference: v.ctRef } : {}),
  summary: (v) =>
    `CT Sim done on ${formatDate(v.ctDoneOn!)}${v.ctRef ? `. Scan reference ${v.ctRef}` : ''}.${note(v, 'ctNote')}`,
};
