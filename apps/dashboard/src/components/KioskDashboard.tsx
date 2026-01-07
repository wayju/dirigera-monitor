'use client';

import { useEffect, useState, useCallback } from 'react';
import {
  Device,
  CurrentReading,
  fetchDevices,
  fetchCurrentReading,
  Period,
  fetchReadings,
  ReadingsResponse,
  ReadingData,
  TariffInfo,
  fetchTariff,
  fetchApiVersion,
  VersionInfo,
  API_BASE,
} from '@/lib/api';
import dashboardVersion from '@/version.json';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  ResponsiveContainer,
  Tooltip,
  Cell,
  ReferenceLine,
} from 'recharts';
import { format, parseISO, differenceInDays } from 'date-fns';
import { processChartDataForPeriod, ChartDataPoint } from '@/lib/chartProcessing';

const REFRESH_INTERVAL = 10000; // 10 seconds
const FULLSCREEN_STORAGE_KEY = 'dashboard-fullscreen';

// Calculate cost from kWh using tariff (cents/kWh)
function calculateCost(kWh: number, tariffCents: number): string {
  const costCents = kWh * tariffCents;
  if (costCents < 1) {
    return `$${(costCents / 100).toFixed(4)}`;
  }
  return `$${(costCents / 100).toFixed(2)}`;
}

export function KioskDashboard() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [readings, setReadings] = useState<Map<string, CurrentReading>>(new Map());
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(null);
  const [period, setPeriod] = useState<Period>('hour');
  const [stats, setStats] = useState<ReadingsResponse | null>(null);
  const [chartData, setChartData] = useState<ChartDataPoint[]>([]);
  const [totalWh, setTotalWh] = useState<number>(0);
  const [statsLoading, setStatsLoading] = useState(true);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showAllDevices, setShowAllDevices] = useState(false);
  const [tariff, setTariff] = useState<TariffInfo | null>(null);
  const [apiVersion, setApiVersion] = useState<VersionInfo | null>(null);
  const [mounted, setMounted] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [isIOSDevice, setIsIOSDevice] = useState(false);
  const [isStandalone, setIsStandalone] = useState(false);

  // Set mounted state and detect iOS
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
      setTimeout(() => {
        const elem = document.documentElement as HTMLElement & {
          webkitRequestFullscreen?: () => Promise<void>;
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
      // Persist fullscreen state to localStorage
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
        // Try standard API first, then webkit prefix
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
        // Exit fullscreen with prefix support
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

  const loadStats = useCallback(async () => {
    if (devices.length === 0) return;
    setStatsLoading(true);
    try {
      let statsData: ReadingsResponse | null = null;

      if (selectedDevice) {
        // Single device
        statsData = await fetchReadings(selectedDevice.id, period);
        console.log(`[API] Fetched ${period} data for device ${selectedDevice.id}:`, statsData);
      } else {
        // Aggregate all devices
        const allReadings = await Promise.all(
          devices.map((d) => fetchReadings(d.id, period).catch(() => null))
        );
        const validReadings = allReadings.filter(
          (r): r is ReadingsResponse => r !== null && r.data.length > 0
        );

        if (validReadings.length > 0) {
          // For hour period, round timestamps to 5-minute intervals for merging
          // For other periods, timestamps are already aligned
          const roundTo5Min = (ts: string): string => {
            const d = new Date(ts);
            d.setMinutes(Math.floor(d.getMinutes() / 5) * 5, 0, 0);
            return d.toISOString();
          };

          // Merge data points by timestamp (rounded for hour period)
          const mergedMap = new Map<string, { power: number; energy: number; count: number }>();
          for (const reading of validReadings) {
            for (const point of reading.data) {
              const key = period === 'hour' ? roundTo5Min(point.timestamp) : point.timestamp;
              const existing = mergedMap.get(key);
              if (existing) {
                existing.power += point.power;
                existing.energy += point.energy;
                existing.count += 1;
              } else {
                mergedMap.set(key, { power: point.power, energy: point.energy, count: 1 });
              }
            }
          }

          // Sort by timestamp and create aggregated response
          const sortedData = Array.from(mergedMap.entries())
            .sort(([a], [b]) => a.localeCompare(b))
            .map(([timestamp, values]) => ({
              timestamp,
              power: values.power, // Sum of powers from all devices
              energy: values.energy, // Sum of energy deltas from all devices
            }));

          const powers = sortedData.map((d) => d.power);
          // Energy is now delta (not cumulative), so sum all deltas
          const totalEnergy = sortedData.reduce((sum, d) => sum + d.energy, 0);
          statsData = {
            device: { id: 'all', name: 'All Devices', room: null },
            period,
            data: sortedData,
            summary: {
              avgPower: powers.reduce((a, b) => a + b, 0) / powers.length || 0,
              maxPower: Math.max(...powers, 0),
              minPower: Math.min(...powers, 0),
              totalEnergy,
            },
          };
        }
      }

      setStats(statsData);

      // Process chart data with proper time slots for the period
      if (statsData) {
        const { data, totalWh: total } = processChartDataForPeriod(statsData.data, period);
        setChartData(data);
        setTotalWh(total);
      } else {
        // No data - still show empty slots
        const { data } = processChartDataForPeriod([], period);
        setChartData(data);
        setTotalWh(0);
      }
    } catch {
      setStats(null);
      const { data } = processChartDataForPeriod([], period);
      setChartData(data);
      setTotalWh(0);
    } finally {
      setStatsLoading(false);
    }
  }, [selectedDevice, period, devices]);

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, REFRESH_INTERVAL);
    return () => clearInterval(interval);
  }, [loadData]);

  useEffect(() => {
    loadStats();
  }, [loadStats]);

  // Fetch tariff and API version on mount
  useEffect(() => {
    fetchTariff()
      .then(setTariff)
      .catch((err) => console.error('Failed to fetch tariff:', err));
    fetchApiVersion()
      .then(setApiVersion)
      .catch((err) => console.error('Failed to fetch API version:', err));
  }, []);

  const currentReading = selectedDevice ? readings.get(selectedDevice.id) : null;

  // Calculate total power across all devices
  const totalPower = Array.from(readings.values()).reduce(
    (sum, r) => sum + (r.current?.powerWatts || 0),
    0
  );

  // Visible devices (first 3) and overflow
  const visibleDevices = devices.slice(0, 3);
  const hasMoreDevices = devices.length > 3;

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
    <div className="h-screen w-screen bg-black text-white p-3 select-none overflow-hidden flex flex-col">
      {/* Main content */}
      <div className="flex-1 flex gap-3 min-h-0">
        {/* Left column - Current reading + Chart */}
        <div className="flex-1 flex flex-col gap-3 min-w-0">
          {/* Main power display */}
          <div className="bg-gray-900 rounded-2xl p-4 flex-shrink-0">
            <div className="text-center">
              <div className="text-xs text-gray-400 mb-1">
                {selectedDevice ? selectedDevice.name : 'All Devices'}
              </div>
              <div
                className={`text-4xl font-bold font-mono tracking-tight ${
                  selectedDevice ? 'text-white' : 'text-yellow-400'
                }`}
              >
                {selectedDevice && currentReading?.current
                  ? currentReading.current.powerWatts.toFixed(3)
                  : totalPower.toFixed(3)}
                <span className="text-lg font-normal text-gray-400 ml-1">W</span>
              </div>
            </div>
          </div>

          {/* Charts area */}
          <div className="bg-gray-900 rounded-2xl p-3 flex-1 min-h-0 flex flex-col">
            {/* Period selector and tariff */}
            <div className="flex gap-2 mb-2 flex-shrink-0 items-center">
              <div className="flex gap-1 flex-1">
                {(['hour', 'day', 'week', '6months'] as Period[]).map((p) => {
                  const labels: Partial<Record<Period, string>> = {
                    hour: '24 Hours',
                    day: '7 Days',
                    week: '5 Weeks',
                    '6months': '6 Months',
                  };
                  return (
                    <button
                      key={p}
                      onClick={() => setPeriod(p)}
                      className={`flex-1 py-2 rounded-lg text-xs font-medium transition-all active:scale-95 ${
                        period === p
                          ? 'bg-blue-600 text-white'
                          : 'bg-gray-800 text-gray-400 active:bg-gray-700'
                      }`}
                    >
                      {labels[p]}
                    </button>
                  );
                })}
              </div>
              {mounted && tariff && (
                <div className="text-right text-xs flex-shrink-0">
                  <div className="text-gray-400">{tariff.ratePerKwh.toFixed(2)}¢/kWh</div>
                  <div
                    className={
                      differenceInDays(new Date(), parseISO(tariff.scrapedAt)) > 7
                        ? 'text-yellow-500'
                        : 'text-gray-600'
                    }
                  >
                    {format(parseISO(tariff.scrapedAt), 'MMM d')}
                  </div>
                </div>
              )}
            </div>

            {statsLoading && chartData.length === 0 ? (
              <div className="flex-1 flex items-center justify-center text-gray-600 text-sm">
                Loading...
              </div>
            ) : (
              <div className="flex-1 flex flex-col gap-2 min-h-0 relative">
                {/* Subtle loading indicator when refreshing */}
                {statsLoading && (
                  <div className="absolute top-0 right-0 w-2 h-2 rounded-full bg-blue-500 animate-pulse" />
                )}
                {/* Small Power (W) chart */}
                <div className="h-16 flex-shrink-0">
                  <div className="text-xs text-gray-500 mb-1">Power (W)</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart
                      data={chartData}
                      margin={{ top: 2, right: 5, left: 0, bottom: 0 }}
                    >
                      <defs>
                        <linearGradient id="powerGradient" x1="0" y1="0" x2="0" y2="1">
                          <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.4} />
                          <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <XAxis dataKey="time" hide />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        width={30}
                        domain={[0, 'auto']}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                        itemStyle={{ color: '#e5e7eb' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => [
                          typeof value === 'number' ? `${value.toFixed(3)} W` : 'No data',
                          'Power'
                        ]}
                      />
                      <Area
                        type="monotone"
                        dataKey="power"
                        stroke="#3b82f6"
                        strokeWidth={1.5}
                        fill="url(#powerGradient)"
                        connectNulls={false}
                      />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>

                {/* Larger Energy (kWh) bar chart */}
                <div className="flex-1 min-h-0 mt-4">
                  <div className="text-xs text-gray-500 mb-1">Energy Consumed (kWh)</div>
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart
                      data={chartData.map(d => ({
                        ...d,
                        energy: d.energyDelta !== null ? d.energyDelta / 1000 : null,
                      }))}
                      margin={{ top: 2, right: 5, left: 0, bottom: 15 }}
                    >
                      <XAxis
                        dataKey="time"
                        tick={{ fill: '#6b7280', fontSize: 9 }}
                        axisLine={{ stroke: '#374151' }}
                        tickLine={false}
                        interval={period === 'hour' ? Math.ceil(chartData.length / 12) : 0}
                      />
                      <YAxis
                        tick={{ fill: '#6b7280', fontSize: 9 }}
                        axisLine={false}
                        tickLine={false}
                        width={45}
                        tickFormatter={(v) => {
                          if (v === 0) return '0';
                          if (v < 0.001) return v.toExponential(0);
                          if (v < 0.01) return v.toFixed(3);
                          if (v < 1) return v.toFixed(2);
                          return v.toFixed(1);
                        }}
                      />
                      <Tooltip
                        contentStyle={{
                          backgroundColor: '#1f2937',
                          border: 'none',
                          borderRadius: '8px',
                          fontSize: '11px',
                        }}
                        labelStyle={{ color: '#9ca3af' }}
                        itemStyle={{ color: '#e5e7eb' }}
                        // eslint-disable-next-line @typescript-eslint/no-explicit-any
                        formatter={(value: any) => {
                          if (typeof value !== 'number') return ['No data', 'Energy'];
                          const cost = tariff ? ` (${calculateCost(value, tariff.ratePerKwh)})` : '';
                          return [`${value.toFixed(3)} kWh${cost}`, 'Energy'];
                        }}
                      />
                      <ReferenceLine y={0} stroke="#374151" />
                      <Bar dataKey="energy" name="Energy" radius={[2, 2, 0, 0]}>
                        {chartData.map((entry, index) => (
                          <Cell
                            key={`cell-${index}`}
                            fill={entry.hasData ? '#22c55e' : '#374151'}
                            fillOpacity={entry.energyDelta !== null ? 1 : 0.3}
                          />
                        ))}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            )}
          </div>

          {/* Stats row */}
          <div className="grid grid-cols-3 gap-2 flex-shrink-0">
            <div className="bg-gray-900 rounded-xl p-2 text-center">
              <div className="text-lg font-bold font-mono text-blue-400">
                {stats ? stats.summary.avgPower.toFixed(3) : '--'}
              </div>
              <div className="text-xs text-gray-500">Avg W</div>
            </div>
            <div className="bg-gray-900 rounded-xl p-2 text-center">
              <div className="text-lg font-bold font-mono text-red-400">
                {stats ? stats.summary.maxPower.toFixed(3) : '--'}
              </div>
              <div className="text-xs text-gray-500">Max W</div>
            </div>
            <div className="bg-gray-900 rounded-xl p-2 text-center">
              <div className="text-lg font-bold font-mono text-green-400">
                {(totalWh / 1000).toFixed(6)}
              </div>
              <div className="text-xs text-gray-500">Period kWh</div>
              {mounted && tariff && (
                <div className="text-xs font-mono text-yellow-500 mt-0.5">
                  {calculateCost(totalWh / 1000, tariff.ratePerKwh)}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Right column - Device list */}
        <div className="w-40 flex flex-col gap-2 flex-shrink-0">
          {/* Fullscreen toggle button */}
          {mounted && (
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-xl bg-gray-900 text-center transition-all flex-shrink-0 active:bg-gray-800 active:scale-95"
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                <svg className="w-5 h-5 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 9L4 4m0 0v5m0-5h5m6 0l5-5m0 0v5m0-5h-5m-6 16l-5 5m0 0v-5m0 5h5m6 0l5 5m0 0v-5m0 5h-5" />
                </svg>
              ) : (
                <svg className="w-5 h-5 mx-auto text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5h-4m4 0v-4m0 4l-5-5" />
                </svg>
              )}
            </button>
          )}

          {/* Device buttons (max 3) */}
          {visibleDevices.map((device) => {
            const reading = readings.get(device.id);
            const isSelected = selectedDevice?.id === device.id;
            return (
              <button
                key={device.id}
                onClick={() => setSelectedDevice(isSelected ? null : device)}
                className={`p-3 rounded-xl text-left transition-all active:scale-95 flex-shrink-0 ${
                  isSelected
                    ? 'bg-blue-600 ring-2 ring-blue-400'
                    : 'bg-gray-900 active:bg-gray-800'
                }`}
              >
                <div className="flex justify-between items-start gap-1">
                  <div className="min-w-0 flex-1">
                    <div className="font-medium text-sm truncate">{device.name}</div>
                    <div className="text-xs text-gray-400 truncate">{device.room}</div>
                  </div>
                  {reading?.current && (
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 mt-1 ${
                        reading.current.isOn ? 'bg-green-500' : 'bg-gray-600'
                      }`}
                    />
                  )}
                </div>
                {reading?.current && (
                  <div className="mt-1">
                    <div className="text-lg font-bold font-mono">
                      {reading.current.powerWatts.toFixed(3)}
                      <span className="text-xs font-normal text-gray-400 ml-0.5">W</span>
                    </div>
                    <div className="text-xs font-mono text-gray-500">
                      {reading.current.energyKwh.toFixed(3)} kWh
                      {mounted && tariff && (
                        <span className="text-yellow-500 ml-1">
                          {calculateCost(reading.current.energyKwh, tariff.ratePerKwh)}
                        </span>
                      )}
                    </div>
                  </div>
                )}
              </button>
            );
          })}

          {/* More devices button */}
          {hasMoreDevices && (
            <button
              onClick={() => setShowAllDevices(true)}
              className="p-3 rounded-xl bg-gray-900 text-center active:bg-gray-800 active:scale-95 transition-all"
            >
              <div className="text-gray-400 text-lg">•••</div>
              <div className="text-xs text-gray-500">{devices.length - 3} more</div>
            </button>
          )}

          {/* Spacer */}
          <div className="flex-1" />
        </div>
      </div>

      {/* Timestamp and Version */}
      <div className="text-center text-xs text-gray-700 mt-2 flex-shrink-0 flex items-center justify-center gap-3">
        <span>{mounted && lastUpdate ? lastUpdate.toLocaleTimeString() : '\u00A0'}</span>
        {mounted && apiVersion && (
          <span className="text-gray-600">
            API {apiVersion.version}.{apiVersion.build} | UI {dashboardVersion.version}.{dashboardVersion.build}
          </span>
        )}
      </div>

      {/* Device list modal */}
      {showAllDevices && (
        <div
          className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50"
          onClick={() => setShowAllDevices(false)}
        >
          <div
            className="bg-gray-900 rounded-2xl p-4 max-h-[80vh] w-full max-w-xs overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-sm text-gray-400 mb-3">All Devices</div>
            <div className="space-y-2">
              {devices.map((device) => {
                const reading = readings.get(device.id);
                const isSelected = selectedDevice?.id === device.id;
                return (
                  <button
                    key={device.id}
                    onClick={() => {
                      setSelectedDevice(isSelected ? null : device);
                      setShowAllDevices(false);
                    }}
                    className={`w-full p-3 rounded-xl text-left transition-all active:scale-95 ${
                      isSelected
                        ? 'bg-blue-600 ring-2 ring-blue-400'
                        : 'bg-gray-800 active:bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between items-start">
                      <div>
                        <div className="font-medium text-sm">{device.name}</div>
                        <div className="text-xs text-gray-400">{device.room}</div>
                      </div>
                      <div className="flex items-center gap-2">
                        {reading?.current && (
                          <div className="flex items-center gap-2">
                            <div className="text-right">
                              <div className="text-lg font-bold font-mono">
                                {reading.current.powerWatts.toFixed(3)}
                                <span className="text-xs font-normal text-gray-400 ml-0.5">W</span>
                              </div>
                              <div className="text-xs font-mono text-gray-500">
                                {reading.current.energyKwh.toFixed(3)} kWh
                                {mounted && tariff && (
                                  <span className="text-yellow-500 ml-1">
                                    {calculateCost(reading.current.energyKwh, tariff.ratePerKwh)}
                                  </span>
                                )}
                              </div>
                            </div>
                            <div
                              className={`w-2 h-2 rounded-full ${
                                reading.current.isOn ? 'bg-green-500' : 'bg-gray-600'
                              }`}
                            />
                          </div>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
