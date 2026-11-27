import type { Metadata } from 'next';

import './globals.css';

const appName = process.env.NEXT_PUBLIC_APP_NAME ?? 'OncoTrack';

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:5173'),
  // A page sets `title: 'Settings'` and gets "Settings | OncoTrack".
  title: { default: appName, template: `%s | ${appName}` },
  description: 'Radiation therapy workflow tracking for staff. Contains no patient information.',
  // An internal tool: never indexed.
  robots: { index: false, follow: false },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">{children}</body>
    </html>
  );
}
