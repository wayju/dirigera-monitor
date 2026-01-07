'use client';

import { useState } from 'react';
import { Device, Period } from '@/lib/api';
import { DeviceCard } from './DeviceCard';
import { PeriodSelector } from './PeriodSelector';
import { PowerChart } from './PowerChart';

interface DashboardProps {
  devices: Device[];
}

export function Dashboard({ devices }: DashboardProps) {
  const [selectedDevice, setSelectedDevice] = useState<Device | null>(
    devices[0] || null
  );
  const [period, setPeriod] = useState<Period>('day');

  if (devices.length === 0) {
    return (
      <div className="text-center py-12 text-gray-400">
        <p>No smart plugs found.</p>
        <p className="text-sm mt-2">
          Make sure your DIRIGERA hub is connected and has INSPELNING plugs.
        </p>
      </div>
    );
  }

  return (
    <div className="grid grid-cols-12 gap-6">
      {/* Device list */}
      <div className="col-span-12 lg:col-span-3">
        <h2 className="text-lg font-semibold mb-4">Devices</h2>
        <div className="space-y-3">
          {devices.map((device) => (
            <DeviceCard
              key={device.id}
              device={device}
              onSelect={setSelectedDevice}
              isSelected={selectedDevice?.id === device.id}
            />
          ))}
        </div>
      </div>

      {/* Chart area */}
      <div className="col-span-12 lg:col-span-9">
        {selectedDevice ? (
          <>
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-lg font-semibold">
                {selectedDevice.name}
                {selectedDevice.room && (
                  <span className="text-gray-400 font-normal ml-2">
                    ({selectedDevice.room})
                  </span>
                )}
              </h2>
              <PeriodSelector selected={period} onChange={setPeriod} />
            </div>
            <div className="bg-gray-900 rounded-lg p-6 border border-gray-800">
              <PowerChart device={selectedDevice} period={period} />
            </div>
          </>
        ) : (
          <div className="flex items-center justify-center h-96 text-gray-400">
            Select a device to view power consumption
          </div>
        )}
      </div>
    </div>
  );
}
