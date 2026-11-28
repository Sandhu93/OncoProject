import type { ActionFieldType } from '@oncotrack/contracts';
import { DomainError, type FieldProblem } from '../../transactions/domain-error.js';
import { isIsoDate, isTime } from './dates.js';
import type { FieldDef } from './types.js';

type Extras = Partial<Omit<FieldDef, 'key' | 'label' | 'type' | 'required'>> & {
  required?: boolean;
};

const make =
  (type: ActionFieldType) =>
  (key: string, label: string, extras: Extras = {}): FieldDef => ({
    key,
    label,
    type,
    required: false,
    ...extras,
  });

export const heading = (title: string): FieldDef => ({
  key: `h-${title}`,
  label: title,
  type: 'heading',
  required: false,
});
export const text = make('text');
export const area = make('area');
export const date = make('date');
export const time = make('time');
export const number = make('number');
export const select = make('select');
export const staff = make('staff');

export const DEFAULT_AREA_MAX = 500;
export const DEFAULT_TEXT_MAX = 60;

/**
 * Checks the submitted values against a step's fields and returns clean values (trimmed, unknown keys dropped,
 * empty optional fields left out) together with every problem found. The same rules the screen is told about
 * are enforced here, because the browser is not trusted.
 */
export function readValues(
  fields: readonly FieldDef[],
  submitted: unknown,
): { values: Record<string, string>; problems: FieldProblem[] } {
  const input = (typeof submitted === 'object' && submitted !== null ? submitted : {}) as Record<
    string,
    unknown
  >;
  const values: Record<string, string> = {};
  const problems: FieldProblem[] = [];
  const problem = (field: string, message: string) => problems.push({ field, message });

  for (const field of fields) {
    if (field.type === 'heading') continue;
    const raw = input[field.key];
    if (raw !== undefined && raw !== null && typeof raw !== 'string' && typeof raw !== 'number') {
      problem(field.key, 'Must be text.');
      continue;
    }
    const value = raw === undefined || raw === null ? '' : String(raw).trim();
    values[field.key] = value;
  }

  for (const field of fields) {
    if (field.type === 'heading' || problems.some((item) => item.field === field.key)) continue;
    const value = values[field.key]!;
    const required = field.required || field.requiredWhen?.(values) === true;
    if (value === '') {
      if (required)
        problem(
          field.key,
          field.requiredMessage ??
            `Enter ${field.label.charAt(0).toLowerCase()}${field.label.slice(1)}.`,
        );
      delete values[field.key];
      continue;
    }
    switch (field.type) {
      case 'date':
        if (!isIsoDate(value)) problem(field.key, 'Enter a real date.');
        else if (field.min && value < field.min)
          problem(field.key, field.minMessage ?? 'This date is too early.');
        else if (field.max && value > field.max)
          problem(field.key, field.maxMessage ?? 'This date is too late.');
        break;
      case 'time':
        if (!isTime(value)) problem(field.key, 'Enter a time such as 10:30.');
        break;
      case 'number':
        if (!/^\d{1,4}$/.test(value)) problem(field.key, 'Enter a whole number.');
        else if (field.min !== undefined && Number(value) < Number(field.min)) {
          problem(field.key, field.minMessage ?? `Enter ${field.min} or more.`);
        } else if (field.max !== undefined && Number(value) > Number(field.max)) {
          problem(field.key, field.maxMessage ?? `Enter ${field.max} or fewer.`);
        }
        break;
      case 'select':
      case 'staff':
        if (!field.options?.some((option) => option.value === value))
          problem(field.key, 'Choose one of the options.');
        break;
      default: {
        const max =
          field.maxLength ?? (field.type === 'area' ? DEFAULT_AREA_MAX : DEFAULT_TEXT_MAX);
        if (value.length > max) problem(field.key, `Use at most ${max} characters.`);
      }
    }
  }
  return { values, problems };
}

export function refuse(problems: readonly FieldProblem[]): never {
  throw new DomainError(400, 'VALIDATION_FAILED', 'Some fields need attention.', problems);
}
