import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock node-cron
vi.mock('node-cron', () => ({
  default: {
    schedule: vi.fn(),
  },
}));

// Mock config
vi.mock('./config.js', () => ({
  config: {
    pollIntervalMinutes: 5,
  },
}));

// Mock aggregation
vi.mock('./aggregation.js', () => ({
  runHourlyAggregation: vi.fn(),
  runDailyAggregation: vi.fn(),
}));

import cron from 'node-cron';
import { DirigeraClient, OutletReading } from './dirigera-client.js';

// Create mock prisma that will be used by the module
const mockPrismaInstance = {
  device: {
    upsert: vi.fn(),
  },
  reading: {
    create: vi.fn(),
  },
};

// Mock prisma client
vi.mock('@prisma/client', () => ({
  PrismaClient: vi.fn(() => mockPrismaInstance),
}));

describe('scheduler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockPrismaInstance.device.upsert.mockReset();
    mockPrismaInstance.reading.create.mockReset();
  });

  describe('collectReadings', () => {
    it('should collect readings from reachable outlets', async () => {
      const mockOutlets: OutletReading[] = [
        {
          deviceId: 'outlet-1',
          name: 'Plug 1',
          room: 'Living Room',
          model: 'INSPELNING',
          isOn: true,
          powerWatts: 50,
          voltage: 240,
          currentAmps: 0.2,
          energyKwh: 10,
          isReachable: true,
        },
        {
          deviceId: 'outlet-2',
          name: 'Plug 2',
          room: 'Bedroom',
          model: 'INSPELNING',
          isOn: false,
          powerWatts: 0,
          voltage: 0,
          currentAmps: 0,
          energyKwh: 5,
          isReachable: false, // Not reachable
        },
      ];

      const mockClient = {
        getOutlets: vi.fn().mockResolvedValue(mockOutlets),
      } as unknown as DirigeraClient;

      mockPrismaInstance.device.upsert.mockResolvedValue({ id: 'db-device-1' });
      mockPrismaInstance.reading.create.mockResolvedValue({});

      const { collectReadings } = await import('./scheduler.js');
      const count = await collectReadings(mockClient);

      expect(mockClient.getOutlets).toHaveBeenCalled();
      expect(mockPrismaInstance.device.upsert).toHaveBeenCalledTimes(2);
      // Only 1 reading should be saved (the reachable one)
      expect(count).toBe(1);
    });

    it('should upsert device with correct data', async () => {
      const mockOutlet: OutletReading = {
        deviceId: 'outlet-1',
        name: 'Test Plug',
        room: 'Office',
        model: 'INSPELNING Smart plug',
        isOn: true,
        powerWatts: 100,
        voltage: 230,
        currentAmps: 0.43,
        energyKwh: 25,
        isReachable: true,
      };

      const mockClient = {
        getOutlets: vi.fn().mockResolvedValue([mockOutlet]),
      } as unknown as DirigeraClient;

      mockPrismaInstance.device.upsert.mockResolvedValue({ id: 'db-id-1' });
      mockPrismaInstance.reading.create.mockResolvedValue({});

      const { collectReadings } = await import('./scheduler.js');
      await collectReadings(mockClient);

      expect(mockPrismaInstance.device.upsert).toHaveBeenCalledWith({
        where: { dirigeraId: 'outlet-1' },
        create: {
          dirigeraId: 'outlet-1',
          name: 'Test Plug',
          room: 'Office',
          model: 'INSPELNING Smart plug',
        },
        update: {
          name: 'Test Plug',
          room: 'Office',
          model: 'INSPELNING Smart plug',
        },
      });
    });
  });

  describe('startScheduler', () => {
    it('should schedule cron jobs for data collection and aggregation', async () => {
      const mockClient = {} as DirigeraClient;

      const { startScheduler } = await import('./scheduler.js');
      startScheduler(mockClient);

      // Should schedule 3 cron jobs
      expect(cron.schedule).toHaveBeenCalledTimes(3);

      // Check cron patterns
      const calls = (cron.schedule as ReturnType<typeof vi.fn>).mock.calls;
      expect(calls[0][0]).toBe('*/5 * * * *'); // Every 5 minutes
      expect(calls[1][0]).toBe('5 * * * *'); // Hourly at :05
      expect(calls[2][0]).toBe('10 0 * * *'); // Daily at 00:10
    });
  });
});
