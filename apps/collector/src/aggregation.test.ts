import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPreviousMonths, runHourlyAggregation, runDailyAggregation, ensureMonthlySummary } from './aggregation.js';
import { PrismaClient } from '@prisma/client';

describe('aggregation', () => {
  describe('getPreviousMonths', () => {
    it('should return correct number of previous months', () => {
      const months = getPreviousMonths(3);
      expect(months).toHaveLength(3);
    });

    it('should return months in YYYY-MM format', () => {
      const months = getPreviousMonths(1);
      expect(months[0]).toMatch(/^\d{4}-\d{2}$/);
    });

    it('should handle year boundary correctly', () => {
      // Mock date to January
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-15'));

      const months = getPreviousMonths(3);

      expect(months).toContain('2024-12');
      expect(months).toContain('2024-11');
      expect(months).toContain('2024-10');

      vi.useRealTimers();
    });

    it('should return months in reverse chronological order', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15'));

      const months = getPreviousMonths(3);

      expect(months[0]).toBe('2025-05');
      expect(months[1]).toBe('2025-04');
      expect(months[2]).toBe('2025-03');

      vi.useRealTimers();
    });
  });

  describe('runHourlyAggregation', () => {
    let mockPrisma: {
      device: { findMany: ReturnType<typeof vi.fn> };
      reading: { findMany: ReturnType<typeof vi.fn> };
      hourlySummary: { upsert: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      mockPrisma = {
        device: { findMany: vi.fn() },
        reading: { findMany: vi.fn() },
        hourlySummary: { upsert: vi.fn() },
      };
    });

    it('should aggregate hourly readings correctly', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-03T10:30:00Z'));

      mockPrisma.device.findMany.mockResolvedValue([{ id: 'device-1' }]);
      mockPrisma.reading.findMany.mockResolvedValue([
        { powerWatts: 50 },
        { powerWatts: 60 },
        { powerWatts: 40 },
      ]);
      mockPrisma.hourlySummary.upsert.mockResolvedValue({});

      await runHourlyAggregation(mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.hourlySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            deviceId: 'device-1',
            avgPower: 50,
            maxPower: 60,
            minPower: 40,
            energyKwh: 0.05, // 50W avg for 1 hour = 0.05 kWh
          }),
        })
      );

      vi.useRealTimers();
    });

    it('should skip devices with no readings', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-03T10:30:00Z'));

      mockPrisma.device.findMany.mockResolvedValue([{ id: 'device-1' }]);
      mockPrisma.reading.findMany.mockResolvedValue([]);

      await runHourlyAggregation(mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.hourlySummary.upsert).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('runDailyAggregation', () => {
    let mockPrisma: {
      device: { findMany: ReturnType<typeof vi.fn> };
      hourlySummary: { findMany: ReturnType<typeof vi.fn> };
      dailySummary: { upsert: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      mockPrisma = {
        device: { findMany: vi.fn() },
        hourlySummary: { findMany: vi.fn() },
        dailySummary: { upsert: vi.fn() },
      };
    });

    it('should aggregate daily summaries correctly', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-03T00:30:00Z'));

      mockPrisma.device.findMany.mockResolvedValue([{ id: 'device-1' }]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([
        { avgPower: 50, maxPower: 100, minPower: 10, energyKwh: 0.05 },
        { avgPower: 60, maxPower: 120, minPower: 20, energyKwh: 0.06 },
      ]);
      mockPrisma.dailySummary.upsert.mockResolvedValue({});

      await runDailyAggregation(mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.dailySummary.upsert).toHaveBeenCalledWith(
        expect.objectContaining({
          create: expect.objectContaining({
            deviceId: 'device-1',
            avgPower: 55, // (50 + 60) / 2
            maxPower: 120,
            minPower: 10,
            energyKwh: 0.11, // 0.05 + 0.06
          }),
        })
      );

      vi.useRealTimers();
    });

    it('should skip devices with no hourly summaries', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-03T00:30:00Z'));

      mockPrisma.device.findMany.mockResolvedValue([{ id: 'device-1' }]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);

      await runDailyAggregation(mockPrisma as unknown as PrismaClient);

      expect(mockPrisma.dailySummary.upsert).not.toHaveBeenCalled();

      vi.useRealTimers();
    });
  });

  describe('ensureMonthlySummary', () => {
    let mockPrisma: {
      monthlySummary: { findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
      dailySummary: { findMany: ReturnType<typeof vi.fn> };
    };

    beforeEach(() => {
      mockPrisma = {
        monthlySummary: { findUnique: vi.fn(), create: vi.fn() },
        dailySummary: { findMany: vi.fn() },
      };
    });

    it('should skip if monthly summary already exists', async () => {
      mockPrisma.monthlySummary.findUnique.mockResolvedValue({ id: 'existing' });

      await ensureMonthlySummary(mockPrisma as unknown as PrismaClient, 'device-1', '2025-01');

      expect(mockPrisma.dailySummary.findMany).not.toHaveBeenCalled();
      expect(mockPrisma.monthlySummary.create).not.toHaveBeenCalled();
    });

    it('should create monthly summary from daily summaries', async () => {
      mockPrisma.monthlySummary.findUnique.mockResolvedValue(null);
      mockPrisma.dailySummary.findMany.mockResolvedValue([
        { avgPower: 100, maxPower: 200, minPower: 50, energyKwh: 2.4 },
        { avgPower: 120, maxPower: 180, minPower: 60, energyKwh: 2.88 },
      ]);
      mockPrisma.monthlySummary.create.mockResolvedValue({});

      await ensureMonthlySummary(mockPrisma as unknown as PrismaClient, 'device-1', '2025-01');

      expect(mockPrisma.monthlySummary.create).toHaveBeenCalledWith({
        data: expect.objectContaining({
          deviceId: 'device-1',
          yearMonth: '2025-01',
          avgPower: 110,
          maxPower: 200,
          minPower: 50,
        }),
      });
      // Check energyKwh separately due to floating point
      const callData = mockPrisma.monthlySummary.create.mock.calls[0][0].data;
      expect(callData.energyKwh).toBeCloseTo(5.28, 2);
    });

    it('should skip if no daily summaries exist', async () => {
      mockPrisma.monthlySummary.findUnique.mockResolvedValue(null);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);

      await ensureMonthlySummary(mockPrisma as unknown as PrismaClient, 'device-1', '2025-01');

      expect(mockPrisma.monthlySummary.create).not.toHaveBeenCalled();
    });
  });
});
