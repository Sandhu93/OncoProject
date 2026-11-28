/** "12 min", "3 h 5 min", "2 d 4 h": how long a chart has waited, in the largest sensible units. */
export const formatDuration = (minutes: number): string => {
  const total = Math.max(0, Math.floor(minutes));

  if (total < 60) return `${total} min`;

  const hours = Math.floor(total / 60);

  if (hours < 24) {
    const rest = total % 60;

    return rest === 0 ? `${hours} h` : `${hours} h ${rest} min`;
  }

  const days = Math.floor(hours / 24);
  const restHours = hours % 24;

  return restHours === 0 ? `${days} d` : `${days} d ${restHours} h`;
};

/** "28 Nov 2026" from a plain YYYY-MM-DD day, which has no time zone to convert. */
export const formatDay = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);

  return new Intl.DateTimeFormat('en-IN', { dateStyle: 'medium', timeZone: 'UTC' }).format(
    new Date(Date.UTC(year!, month! - 1, date)),
  );
};

const DATE_TIME = new Intl.DateTimeFormat('en-IN', {
  dateStyle: 'medium',
  timeStyle: 'short',
  // The department's calendar, whatever time zone the server runs in.
  timeZone: 'Asia/Kolkata',
});

/** "28 Nov 2026, 1:04 am" in India Standard Time. */
export const formatDateTime = (iso: string): string => DATE_TIME.format(new Date(iso));

/** The day `offset` days from a plain YYYY-MM-DD day (negative for earlier). */
export const shiftDay = (day: string, offset: number): string => {
  const [year, month, date] = day.split('-').map(Number);

  return new Date(Date.UTC(year!, month! - 1, date! + offset)).toISOString().slice(0, 10);
};

/** "Sat 28 Nov" from a plain YYYY-MM-DD day. */
export const formatWeekday = (day: string): string => {
  const [year, month, date] = day.split('-').map(Number);

  return new Intl.DateTimeFormat('en-IN', { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' })
    .format(new Date(Date.UTC(year!, month! - 1, date)))
    .replace(',', '');
};
