import './globals.css';
import Script from 'next/script';
import { Polyfills } from '@/components/Polyfills';
import { ErrorBoundary } from '@/components/ErrorBoundary';

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        {/* Runtime environment config - generated at container startup */}
        <Script src="/__env.js" strategy="beforeInteractive" />
      </head>
      <body>
        <Polyfills />
        <ErrorBoundary>{children}</ErrorBoundary>
      </body>
    </html>
  );
}
