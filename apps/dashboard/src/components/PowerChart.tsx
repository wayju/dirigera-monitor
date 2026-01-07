'use client';

import { useEffect, useState } from 'react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import { format } from 'date-fns';
import { Device, Period, ReadingsResponse, fetchReadings } from '@/lib/api';

interface PowerChartProps {
  device: Device;
  period: Period;
}

function formatTimestamp(timestamp: string, period: Period): string {
  const date = new Date(timestamp);
  switch (period) {
    case 'hour':
      return format(date, 'HH:mm');
    case 'day':
      return format(date, 'HH:mm');
    case 'week':
      return format(date, 'EEE');
    case 'month':
      return format(date, 'MMM d');
    case '6months':
      return format(date, 'MMM yy');
  }
}

export function PowerChart({ device, period }: PowerChartProps) {
  const [data, setData] = useState<ReadingsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      try {
        const readings = await fetchReadings(device.id, period);
        setData(readings);
        setError(null);
      } catch {
        setError('Failed to load chart data');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [device.id, period]);

  if (loading) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-400">
        Loading chart...
      </div>
    );
  }

  if (error) {
    return (
      <div className="h-80 flex items-center justify-center text-red-400">
        {error}
      </div>
    );
  }

  if (!data || data.data.length === 0) {
    return (
      <div className="h-80 flex items-center justify-center text-gray-400">
        No data available for this period
      </div>
    );
  }

  const chartData = data.data.map((d) => ({
    ...d,
    formattedTime: formatTimestamp(d.timestamp, period),
  }));

  return (
    <div>
      <div className="grid grid-cols-4 gap-4 mb-6">
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Avg Power</p>
          <p className="text-2xl font-mono">{data.summary.avgPower.toFixed(1)} W</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Max Power</p>
          <p className="text-2xl font-mono">{data.summary.maxPower.toFixed(1)} W</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Min Power</p>
          <p className="text-2xl font-mono">{data.summary.minPower.toFixed(1)} W</p>
        </div>
        <div className="bg-gray-800 rounded-lg p-4">
          <p className="text-sm text-gray-400">Total Energy</p>
          <p className="text-2xl font-mono">{data.summary.totalEnergy.toFixed(3)} kWh</p>
        </div>
      </div>

      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
            <XAxis
              dataKey="formattedTime"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
            />
            <YAxis
              yAxisId="power"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
              label={{
                value: 'Power (W)',
                angle: -90,
                position: 'insideLeft',
                fill: '#9CA3AF',
              }}
            />
            <YAxis
              yAxisId="energy"
              orientation="right"
              stroke="#9CA3AF"
              tick={{ fill: '#9CA3AF' }}
              label={{
                value: 'Energy (kWh)',
                angle: 90,
                position: 'insideRight',
                fill: '#9CA3AF',
              }}
            />
            <Tooltip
              contentStyle={{
                backgroundColor: '#1F2937',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
              labelStyle={{ color: '#9CA3AF' }}
            />
            <Legend />
            <Line
              yAxisId="power"
              type="monotone"
              dataKey="power"
              name="Power (W)"
              stroke="#3B82F6"
              strokeWidth={2}
              dot={false}
            />
            <Line
              yAxisId="energy"
              type="monotone"
              dataKey="energy"
              name="Energy (kWh)"
              stroke="#10B981"
              strokeWidth={2}
              dot={false}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
