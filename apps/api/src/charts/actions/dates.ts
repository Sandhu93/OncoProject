/** Calendar helpers on plain YYYY-MM-DD strings. The department's day is the India Standard Time day. */
const DATE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;

/** True for a real calendar date such as 2026-12-03, false for 2026-02-30 or 3/12/2026. */
export function isIsoDate(value: string): boolean {
  const match = DATE.exec(value);
  if (!match) return false;
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  return parsed.toISOString().slice(0, 10) === value;
}

export const isTime = (value: string): boolean => TIME.test(value);

export function addDays(date: string, days: number): string {
  const parsed = new Date(`${date}T00:00:00Z`);
  parsed.setUTCDate(parsed.getUTCDate() + days);
  return parsed.toISOString().slice(0, 10);
}

/** Sunday is the department's day off, so a suggested date moves to Monday. */
export function skipSunday(date: string): string {
  return new Date(`${date}T00:00:00Z`).getUTCDay() === 0 ? addDays(date, 1) : date;
}

/** The Saturday on or before this date; weekly updates are dated by their Saturday. */
export function saturdayOnOrBefore(date: string): string {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 1) % 7));
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** "3 Dec 2026" */
export function formatDate(date: string): string {
  const [year, month, day] = date.split('-').map(Number);
  return `${day} ${MONTHS[month! - 1]} ${year}`;
}

/** "3 Dec 2026, 10:00" */
export const formatWhen = (date: string, time: string): string => `${formatDate(date)}, ${time}`;
