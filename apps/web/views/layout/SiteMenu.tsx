'use client';

import { type ReactNode, useEffect, useRef, useState } from 'react';
import Link from 'next/link';

export interface MenuLink {
  href: string;
  label: string;
  current: boolean;
}

interface SiteMenuProps {
  fullName: string;
  /** Links shown in the bar on a wide screen. */
  primary: readonly MenuLink[];
  /** Links under the account button on a wide screen. */
  more: readonly MenuLink[];
  /** The inbox link: it stays in the bar at every width. */
  bell: ReactNode;
}

const initialsOf = (name: string) =>
  name
    .replace(/^dr\.?\s+/i, '')
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

const barLink =
  'rounded-lg px-3.5 py-2 text-[15px] font-medium text-foreground hover:bg-brand-soft aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand';
const stackLink =
  'block rounded-lg px-3.5 py-3 text-base font-medium text-foreground hover:bg-brand-soft aria-[current=page]:bg-brand-soft aria-[current=page]:font-semibold aria-[current=page]:text-brand';

function LogOut({ className }: { className: string }) {
  return (
    <form method="post" action="/api/auth/clear">
      <button type="submit" className={className}>
        Log out
      </button>
    </form>
  );
}

/**
 * The bar. Over 1000px the links sit in it and the rest is under the account button. Under that, one
 * menu button opens a panel with everything, so nothing is squeezed or hidden.
 */
export default function SiteMenu({ fullName, primary, more, bell }: SiteMenuProps) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);

  // Escape closes whichever is open; a click outside the account menu closes it.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      setDrawerOpen(false);
      setAccountOpen(false);
    };
    const onClick = (event: MouseEvent) => {
      if (accountRef.current && !accountRef.current.contains(event.target as Node)) setAccountOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onClick);

    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onClick);
    };
  }, []);

  const link = (item: MenuLink, className: string, onNavigate?: () => void) => (
    <Link
      key={item.href}
      href={item.href}
      aria-current={item.current ? 'page' : undefined}
      className={className}
      onClick={onNavigate}
    >
      {item.label}
    </Link>
  );

  return (
    <>
      <div className="mx-auto flex h-16 max-w-7xl items-center gap-2 px-4 sm:px-6 lg:gap-8 lg:px-8">
        <Link href="/dashboard" className="mr-auto flex flex-none items-center gap-2.5 text-lg font-bold lg:mr-0">
          <span className="inline-block h-7 w-7 rounded-lg bg-brand" aria-hidden="true" />
          OncoTrack
        </Link>

        <nav aria-label="Main" className="hidden min-w-0 flex-1 items-center gap-1 lg:flex">
          {primary.map(item => link(item, barLink))}
        </nav>

        <form method="get" action="/charts" className="hidden lg:block">
          <label className="flex h-10 w-44 items-center gap-2 rounded-lg border border-line px-3 focus-within:border-brand">
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              className="text-muted"
              aria-hidden="true"
            >
              <circle cx="11" cy="11" r="7" />
              <path d="M20 20l-4-4" />
            </svg>
            <input
              name="q"
              type="search"
              placeholder="Find RT number"
              aria-label="Find a chart"
              autoComplete="off"
              maxLength={40}
              className="w-full min-w-0 flex-1 bg-transparent text-sm outline-none placeholder:text-muted"
            />
          </label>
        </form>

        {bell}

        <div ref={accountRef} className="relative hidden lg:block">
          <button
            type="button"
            aria-expanded={accountOpen}
            aria-controls="account-menu"
            aria-label={`Account menu, ${fullName}`}
            onClick={() => setAccountOpen(open => !open)}
            className="inline-flex h-11 items-center gap-1.5 rounded-lg pl-1 pr-2 hover:bg-brand-soft"
          >
            <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-brand-soft text-sm font-semibold text-brand">
              {initialsOf(fullName)}
            </span>
            <svg
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className="text-muted"
              aria-hidden="true"
            >
              <path d="M6 9l6 6 6-6" />
            </svg>
          </button>
          {accountOpen && (
            <div
              id="account-menu"
              className="absolute right-0 top-full z-40 mt-2 w-60 rounded-xl border border-line bg-surface p-2 shadow-lg"
            >
              <p className="px-3.5 py-2 text-sm text-muted">{fullName}</p>
              <nav aria-label="More pages" className="flex flex-col gap-0.5">
                {more.map(item => link(item, stackLink, () => setAccountOpen(false)))}
              </nav>
              <div className="mt-1 border-t border-line pt-1">
                <LogOut className={`${stackLink} w-full text-left`} />
              </div>
            </div>
          )}
        </div>

        <button
          type="button"
          aria-label="Menu"
          aria-expanded={drawerOpen}
          aria-controls="menu-drawer"
          onClick={() => setDrawerOpen(open => !open)}
          className="inline-flex h-11 w-11 items-center justify-center rounded-lg hover:bg-brand-soft lg:hidden"
        >
          <svg
            width="24"
            height="24"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            aria-hidden="true"
          >
            {drawerOpen ? <path d="M6 6l12 12M18 6L6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
          </svg>
        </button>
      </div>

      {drawerOpen && (
        <div id="menu-drawer" className="border-t border-line bg-surface px-4 pb-5 pt-3 sm:px-6 lg:hidden">
          <form method="get" action="/charts" className="mb-3">
            <label className="flex h-12 items-center gap-2 rounded-lg border border-line px-3.5 focus-within:border-brand">
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                className="text-muted"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="7" />
                <path d="M20 20l-4-4" />
              </svg>
              <input
                name="q"
                type="search"
                placeholder="Find RT number"
                aria-label="Find a chart"
                autoComplete="off"
                maxLength={40}
                className="w-full min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted"
              />
            </label>
          </form>
          <nav aria-label="Main" className="flex flex-col gap-0.5">
            {primary.map(item => link(item, stackLink, () => setDrawerOpen(false)))}
          </nav>
          <div className="mt-3 border-t border-line pt-3">
            <p className="px-3.5 pb-1 text-sm text-muted">{fullName}</p>
            <nav aria-label="More pages" className="flex flex-col gap-0.5">
              {more.map(item => link(item, stackLink, () => setDrawerOpen(false)))}
            </nav>
            <LogOut className={`${stackLink} w-full text-left`} />
          </div>
        </div>
      )}
    </>
  );
}
