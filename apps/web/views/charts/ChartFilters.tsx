export const STATUS_OPTIONS = [
  { value: 'OPEN', label: 'Open' },
  { value: 'CLOSED', label: 'Closed' },
  { value: 'DISCONTINUED', label: 'Discontinued' },
  { value: 'ALL', label: 'All' },
] as const;

interface ChartFiltersProps {
  q: string;
  status: string;
}

/** A plain GET form: the search is in the address bar, so a result page can be bookmarked or shared. */
export default function ChartFilters({ q, status }: ChartFiltersProps) {
  return (
    <form method="get" action="/charts" role="search" className="flex flex-wrap items-end gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="q" className="text-sm font-medium">
          RT number
        </label>
        <input
          id="q"
          name="q"
          type="search"
          defaultValue={q}
          autoComplete="off"
          maxLength={40}
          className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label htmlFor="status" className="text-sm font-medium">
          Status
        </label>
        <select
          id="status"
          name="status"
          defaultValue={status}
          className="min-h-11 rounded-[10px] border border-line bg-surface px-3 py-2 text-base"
        >
          {STATUS_OPTIONS.map(option => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </div>
      <button
        type="submit"
        className="min-h-11 rounded-[10px] bg-brand px-5 py-2 font-medium text-brand-ink hover:opacity-90"
      >
        Search
      </button>
    </form>
  );
}
