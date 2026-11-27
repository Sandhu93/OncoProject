import Link from 'next/link';

interface PaginationProps {
  page: number;
  pageSize: number;
  total: number;
  /** The address for another page, keeping the search and status. */
  hrefForPage: (page: number) => string;
}

export default function Pagination({ page, pageSize, total, hrefForPage }: PaginationProps) {
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const last = Math.min(page * pageSize, total);
  const hasPrevious = page > 1;
  const hasNext = last < total;

  return (
    <nav aria-label="Pages" className="flex items-center justify-between text-sm">
      <p>
        Showing {first}–{last} of {total}
      </p>
      <div className="flex gap-4">
        {hasPrevious && (
          <Link href={hrefForPage(page - 1)} rel="prev" className="underline underline-offset-4">
            Previous
          </Link>
        )}
        {hasNext && (
          <Link href={hrefForPage(page + 1)} rel="next" className="underline underline-offset-4">
            Next
          </Link>
        )}
      </div>
    </nav>
  );
}
