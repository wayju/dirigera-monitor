'use client';

import { useEffect, useState } from 'react';
import { fetchApiVersion, VersionInfo } from '@/lib/api';
import dashboardVersion from '@/version.json';

export function Footer() {
  const [apiVersion, setApiVersion] = useState<VersionInfo | null>(null);

  useEffect(() => {
    fetchApiVersion()
      .then(setApiVersion)
      .catch(() => setApiVersion(null));
  }, []);

  return (
    <footer className="border-t border-gray-800 bg-gray-900 py-2">
      <div className="container mx-auto px-4 text-center text-xs text-gray-500 flex justify-center gap-4">
        <span>Dashboard: v{dashboardVersion.version}.{dashboardVersion.build}</span>
        {apiVersion && (
          <span>API: v{apiVersion.version}.{apiVersion.build}</span>
        )}
      </div>
    </footer>
  );
}
