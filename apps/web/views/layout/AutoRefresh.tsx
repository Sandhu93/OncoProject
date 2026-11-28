'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

/** Re-reads the page's data every so often while it is visible, so a queue stays current without a manual reload. */
export default function AutoRefresh({ everyMs = 30_000 }: { everyMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (document.visibilityState === 'visible') router.refresh();
    }, everyMs);

    return () => window.clearInterval(timer);
  }, [router, everyMs]);

  return null;
}
