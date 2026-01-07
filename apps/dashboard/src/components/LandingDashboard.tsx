'use client';

import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import {
  Device,
  CurrentReading,
  fetchDevices,
  fetchCurrentReading,
  fetchReadings,
  ReadingsResponse,
  fetchApiVersion,
  VersionInfo,
  API_BASE,
} from '@/lib/api';
import dashboardVersion from '@/version.json';
import { DeviceSummaryCard, DeviceCardData } from './DeviceSummaryCard';

const REFRESH_INTERVAL = 10000; // 10 seconds
const FULLSCREEN_STORAGE_KEY = 'dashboard-fullscreen';

export function LandingDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Map<string, CurrentReading>>(new Map());
  const [cardData, setCardData] = useState<DeviceCardData[]>([]);
  const [loading, setLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [apiVersion, setApiVersion] = useState<VersionInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Set mounted state and detect iOS, restore fullscreen from localStorage
  useEffect(() => {
    setMounted(true);
    // Detect iOS device
    const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) ||
      (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
    setIsIOSDevice(isIOS);
    // Check if running as standalone (added to home screen)
    const standalone = window.matchMedia('(display-mode: standalone)').matches ||
      (window.navigator as unknown as { standalone?: boolean }).standalone === true;
    setIsStandalone(standalone);

    // Restore fullscreen from localStorage
    const storedFullscreen = localStorage.getItem(FULLSCREEN_STORAGE_KEY);
    if (storedFullscreen === 'true' && !isIOS) {
      // Try to enter fullscreen after a small delay (browser may require user interaction)
      setTimeout(() => {
        const elem = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };
        if (elem.requestFullscreen) {
          elem.requestFullscreen().catch(() => {});
        } else if (elem.webkitRequestFullscreen) {
          elem.webkitRequestFullscreen();
        }
      }, 100);
    }
  }, []);

  // Track fullscreen state changes (with webkit prefix support)
  useEffect(() => {
    const handleFullscreenChange = () => {
      const fullscreenEl = document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement ||
        (document as unknown as { msFullscreenElement?: Element }).msFullscreenElement;
      const isFs = !!fullscreenEl;
      setIsFullscreen(isFs);
      // Persist fullscreen state
      localStorage.setItem(FULLSCREEN_STORAGE_KEY, isFs.toString());
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('webkitfullscreenchange', handleFullscreenChange);
    document.addEventListener('mozfullscreenchange', handleFullscreenChange);
    document.addEventListener('MSFullscreenChange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenChange);
      document.removeEventListener('mozfullscreenchange', handleFullscreenChange);
      document.removeEventListener('MSFullscreenChange', handleFullscreenChange);
    };
  }, []);

  const toggleFullscreen = useCallback(async () => {
    try {
      const fullscreenEl = document.fullscreenElement ||
        (document as unknown as { webkitFullscreenElement?: Element }).webkitFullscreenElement ||
        (document as unknown as { mozFullScreenElement?: Element }).mozFullScreenElement ||
        (document as unknown as { msFullscreenElement?: Element }).msFullscreenElement;

      if (!fullscreenEl) {
        const elem = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
          mozRequestFullScreen?: () => Promise<void>;
          msRequestFullscreen?: () => Promise<void>;
        };
        if (elem.requestFullscreen) {
          await elem.requestFullscreen();
        } else if (elem.webkitRequestFullscreen) {
          await elem.webkitRequestFullscreen();
        } else if (elem.mozRequestFullScreen) {
          await elem.mozRequestFullScreen();
        } else if (elem.msRequestFullscreen) {
          await elem.msRequestFullscreen();
        }
      } else {
        const doc = document as Document & {
          webkitExitFullscreen?: () => Promise<void>;
          mozCancelFullScreen?: () => Promise<void>;
          msExitFullscreen?: () => Promise<void>;
        };
        if (doc.exitFullscreen) {
          await doc.exitFullscreen();
        } else if (doc.webkitExitFullscreen) {
          await doc.webkitExitFullscreen();
        } else if (doc.mozCancelFullScreen) {
          await doc.mozCancelFullScreen();
        } else if (doc.msExitFullscreen) {
          await doc.msExitFullscreen();
        }
      }
    } catch (err) {
      console.error('Fullscreen error:', err);
    }
  }, []);

  // Load devices and current readings
  const loadData = useCallback(async () => {
    try {
      const deviceList = await fetchDevices();
      setDevices(deviceList);

      // Fetch current readings for all devices
      const readingMap = new Map<string, CurrentReading>();
      for (const device of deviceList) {
        try {
          const reading = await fetchCurrentReading(device.id);
          readingMap.set(device.id, reading);
        } catch {
          // Skip failed readings
        }
      }
      setReadings(readingMap);
      setLastUpdate(new Date());
      setError(null);
    } catch {
      setError('Connection lost');
    }
  }, []);

  // Load stats for cards (60m, 24hr, monthly data) and determine top 3 consumers
  const loadCardData = useCallback(async () => {
    if (devices.length === 0) return;

    setLoading(true);
    try {
      // Fetch day readings for all devices to determine top 3 consumers
      const deviceEnergies: { device: Device; energy: number }[] = [];
      const dayReadings = new Map<string, ReadingsResponse>();
      const hourReadings = new Map<string, ReadingsResponse>();
      const monthlyReadings = new Map<string, ReadingsResponse>();

      for (const device of devices) {
        try {
          const [dayData, hourData, sixMonthData] = await Promise.all([
            fetchReadings(device.id, 'day'),
            fetchReadings(device.id, 'hour'),
            fetchReadings(device.id, '6months'),
          ]);
          dayReadings.set(device.id, dayData);
          hourReadings.set(device.id, hourData);
          monthlyReadings.set(device.id, sixMonthData);
          deviceEnergies.push({
            device,
            energy: dayData.summary.totalEnergy,
          });
        } catch {
          // Skip failed readings
        }
      }

      // Sort by 24hr energy consumption and get top 3
      const sortedDevices = deviceEnergies
        .sort((a, b) => b.energy - a.energy)
        .slice(0, 3);

      // Build card data for Total and Top 3
      const cards: DeviceCardData[] = [];

      // Total card (aggregate all devices)
      const totalCurrentW = Array.from(readings.values()).reduce(
        (sum, r) => sum + (r.current?.powerWatts || 0),
        0
      );

      // Aggregate hour data for total
      let totalHourAvgW = 0;
      let totalHourMaxW = 0;
      let totalHourEnergy = 0;
      const allHourData: { timestamp: string; power: number; energy: number }[] = [];
      for (const [, data] of hourReadings) {
        totalHourAvgW += data.summary.avgPower;
        if (data.summary.maxPower > totalHourMaxW) totalHourMaxW = data.summary.maxPower;
        totalHourEnergy += data.summary.totalEnergy;
        for (const point of data.data) {
          allHourData.push(point);
        }
      }

      // Aggregate day data for total
      let totalDayEnergy = 0;
      const allDayData: { timestamp: string; power: number; energy: number }[] = [];
      for (const [, data] of dayReadings) {
        totalDayEnergy += data.summary.totalEnergy;
        for (const point of data.data) {
          allDayData.push(point);
        }
      }

      // Aggregate monthly data for total - extract current and last month
      let totalCurrentMonthEnergy = 0;
      let totalLastMonthEnergy = 0;
      const allMonthlyData: { timestamp: string; power: number; energy: number }[] = [];
      for (const [, data] of monthlyReadings) {
        if (data.data.length > 0) {
          // Current month is last entry
          totalCurrentMonthEnergy += data.data[data.data.length - 1].energy;
        }
        if (data.data.length > 1) {
          // Last month is second to last entry
          totalLastMonthEnergy += data.data[data.data.length - 2].energy;
        }
        for (const point of data.data) {
          allMonthlyData.push(point);
        }
      }

      // Average the avgPower by number of devices
      if (hourReadings.size > 0) {
        totalHourAvgW = totalHourAvgW; // Sum of averages (represents total avg power)
      }

      cards.push({
        id: 'total',
        name: 'All Devices',
        currentW: totalCurrentW,
        avgW60m: totalHourAvgW,
        maxW60m: totalHourMaxW,
        energy60m: totalHourEnergy,
        energy24h: totalDayEnergy,
        energyCurrentMonth: totalCurrentMonthEnergy,
        energyLastMonth: totalLastMonthEnergy,
        hourData: mergeTimeseriesData(allHourData),
        dayData: mergeTimeseriesData(allDayData),
        monthData: mergeTimeseriesData(allMonthlyData),
      });

      // Individual device cards for top 3
      for (const { device } of sortedDevices) {
        const reading = readings.get(device.id);
        const hourData = hourReadings.get(device.id);
        const dayData = dayReadings.get(device.id);
        const monthData = monthlyReadings.get(device.id);

        let currentMonthEnergy = 0;
        let lastMonthEnergy = 0;
        if (monthData && monthData.data.length > 0) {
          currentMonthEnergy = monthData.data[monthData.data.length - 1].energy;
          if (monthData.data.length > 1) {
            lastMonthEnergy = monthData.data[monthData.data.length - 2].energy;
          }
        }

        cards.push({
          id: device.id,
          name: device.name,
          currentW: reading?.current?.powerWatts || 0,
          avgW60m: hourData?.summary.avgPower || 0,
          maxW60m: hourData?.summary.maxPower || 0,
          energy60m: hourData?.summary.totalEnergy || 0,
          energy24h: dayData?.summary.totalEnergy || 0,
          energyCurrentMonth: currentMonthEnergy,
          energyLastMonth: lastMonthEnergy,
          hourData: hourData?.data || [],
          dayData: dayData?.data || [],
          monthData: monthData?.data || [],
        });
      }

      setCardData(cards);
    } catch (err) {
      console.error('Failed to load card data:', err);
    } finally {
      setLoading(false);
    }
  }, [devices, readings]);

  // Merge timeseries data by timestamp (sum values at same timestamps)
  function mergeTimeseriesData(
    data: { timestamp: string; power: number; energy: number }[]
  ): { timestamp: string; power: number; energy: number }[] {
    const merged = new Map<string, { power: number; energy: number }>();
    for (const point of data) {
      const existing = merged.get(point.timestamp);
      if (existing) {
        existing.power += point.power;
        existing.energy += point.energy;
      } else {
        merged.set(point.timestamp, { power: point.power, energy: point.energy });
      }
    }
    return Array.from(merged.entries())
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([timestamp, values]) => ({
        timestamp,
        power: values.power,
        energy: values.energy,
      }));
  }

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    loadCardData();
  }, [loadCardData]);

  // Fetch API version on mount
  useEffect(() => {
    fetchApiVersion()
      .then(setApiVersion)
      .catch((err) => console.error('Failed to fetch API version:', err));
  }, []);

  if (error) {
    return (
      <div className="h-screen w-screen bg-black flex flex-col items-center justify-center gap-4">
        <div className="text-red-500 text-2xl">{error}</div>
        <div className="text-gray-500 text-sm">
          API: <code className="bg-gray-800 px-2 py-1 rounded">{API_BASE}</code>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen w-screen bg-black text-white p-4 select-none overflow-hidden flex flex-col">
      {/* Header */}
      <div className="flex justify-between items-center mb-4 flex-shrink-0">
        <h1 className="text-xl font-semibold text-gray-200">Power Dashboard</h1>
        <div className="flex items-center gap-3">
          <Link
            href="/kiosk"
            className="px-3 py-1.5 bg-gray-800 hover:bg-gray-700 rounded-lg text-sm text-gray-300 transition-colors flex items-center gap-1"
          >
            Kiosk Mode
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
          </Link>
          {/* Fullscreen button */}
          {mounted && (
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg bg-gray-800 transition-all hover:bg-gray-700 active:scale-95"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5" />
                </svg>
              ) : (
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                </svg>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Vertical card list */}
      <div className="flex-1 flex flex-col gap-2 min-h-0 justify-center">
        {loading && cardData.length === 0 ? (
          <div className="flex items-center justify-center text-gray-600">Loading...</div>
        ) : (
          cardData.map((card, index) => (
            <DeviceSummaryCard key={card.id} data={card} isTotal={index === 0} />
          ))
        )}
      </div>

      {/* Footer */}
      <div className="text-center text-xs text-gray-700 mt-3 flex-shrink-0 flex items-center justify-center gap-3">
        <span>{mounted && lastUpdate ? lastUpdate.toLocaleTimeString() : '\u00A0'}</span>
        {mounted && apiVersion && (
          <span className="text-gray-600">
            API {apiVersion.version}.{apiVersion.build} | UI {dashboardVersion.version}.{dashboardVersion.build}
          </span>
        )}
      </div>
    </div>
  );
}
