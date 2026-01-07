'use client';

// Polyfills for older browsers (Safari 12, iOS 12)
// Must be imported before any other code in client components
import 'core-js/stable';
import ResizeObserverPolyfill from 'resize-observer-polyfill';

// Apply ResizeObserver polyfill if not available (Safari < 13.1)
if (typeof window !== 'undefined' && !window.ResizeObserver) {
  window.ResizeObserver = ResizeObserverPolyfill;
}

export function Polyfills() {
  // This component only exists to load polyfills
  return null;
}
