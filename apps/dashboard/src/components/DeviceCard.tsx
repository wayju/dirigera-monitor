'use client';

import { useEffect, useState } from 'react';
import { Device, CurrentReading, fetchCurrentReading } from '@/lib/api';

interface DeviceCardProps {
  device: Device;
  onSelect: (device: Device) => void;
  isSelected: boolean;
}

export function DeviceCard({ device, onSelect, isSelected }: DeviceCardProps) {
  const [reading, setReading] = useState<CurrentReading | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const loadReading = async () => {
      try {
        const data = await fetchCurrentReading(device.id);
        setReading(data);
        setError(null);
      } catch {
        setError('Failed to load');
      }
    };

    loadReading();
    const interval = setInterval(loadReading, 30000); // Refresh every 30s

    return () => clearInterval(interval);
  }, [device.id]);

  const current = reading?.current;

  return (
    <button
      onClick={() => onSelect(device)}
      className={`w-full text-left p-4 rounded-lg border transition-colors ${
        isSelected
          ? 'border-blue-500 bg-blue-500/10'
          : 'border-gray-700 bg-gray-800 hover:border-gray-600'
      }`}
    >
      <div className="flex justify-between items-start mb-2">
        <div>
          <h3 className="font-semibold">{device.name}</h3>
          {device.room && (
            <p className="text-sm text-gray-400">{device.room}</p>
          )}
        </div>
        {current && (
          <span
            className={`px-2 py-1 rounded text-xs ${
              current.isOn
                ? 'bg-green-500/20 text-green-400'
                : 'bg-gray-500/20 text-gray-400'
            }`}
          >
            {current.isOn ? 'ON' : 'OFF'}
          </span>
        )}
      </div>

      {error ? (
        <p className="text-sm text-red-400">{error}</p>
      ) : current ? (
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div>
            <span className="text-gray-400">Power:</span>
            <span className="ml-2 font-mono">{current.powerWatts.toFixed(1)} W</span>
          </div>
          <div>
            <span className="text-gray-400">Voltage:</span>
            <span className="ml-2 font-mono">{current.voltage.toFixed(1)} V</span>
          </div>
          <div>
            <span className="text-gray-400">Current:</span>
            <span className="ml-2 font-mono">
              {(current.currentAmps * 1000).toFixed(0)} mA
            </span>
          </div>
          <div>
            <span className="text-gray-400">Total:</span>
            <span className="ml-2 font-mono">{current.energyKwh.toFixed(2)} kWh</span>
          </div>
        </div>
      ) : (
        <p className="text-sm text-gray-400">Loading...</p>
      )}
    </button>
  );
}
