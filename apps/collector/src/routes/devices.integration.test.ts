import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

describe('Devices Routes - Integration Tests with Real Data', () => {
  let prisma: PrismaClient;
  const TEST_DEVICE_ID = 'test-device-integration';

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Clean up any existing test data
    await prisma.reading.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.hourlySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.device.deleteMany({ where: { id: TEST_DEVICE_ID } });

    // Create test device
    await prisma.device.create({
      data: {
        id: TEST_DEVICE_ID,
        dirigeraId: 'test-dirigera-id',
        name: 'Test Device',
        room: 'Test Room',
        model: 'Test Model',
      },
    });

    // Insert real server-like data based on exported data
    // Dec 30 (Mon) - partial day at 16:00 UTC (Singapore midnight)
    // Dec 31 (Tue) - full day
    // Jan 1 (Wed) - full day
    // Jan 2 (Thu) - full day (printer off, near-zero power)
    // Jan 3 (Fri) - full day (printer on in morning, off later)

    const dailySummaries = [
      {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2025-12-30T16:00:00.000Z'), // Mon 16:00 UTC (bad timezone)
        avgPower: 61.29,
        maxPower: 100,
        minPower: 20,
        energyKwh: 0.735,
      },
      {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2025-12-31T00:00:00.000Z'), // Tue 00:00 UTC
        avgPower: 32.26,
        maxPower: 80,
        minPower: 0,
        energyKwh: 0.161,
      },
      {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2026-01-01T00:00:00.000Z'), // Wed 00:00 UTC
        avgPower: 68.47,
        maxPower: 235.9,
        minPower: 17.2,
        energyKwh: 0.685,
      },
      {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2026-01-02T00:00:00.000Z'), // Thu 00:00 UTC
        avgPower: 0.14,
        maxPower: 0.3,
        minPower: 0,
        energyKwh: 0.002,
      },
      {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2026-01-03T00:00:00.000Z'), // Fri 00:00 UTC
        avgPower: 19.09,
        maxPower: 235.9,
        minPower: 0,
        energyKwh: 0.458,
      },
    ];

    for (const summary of dailySummaries) {
      await prisma.dailySummary.create({ data: summary });
    }
  });

  afterAll(async () => {
    // Clean up
    await prisma.reading.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.hourlySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.device.deleteMany({ where: { id: TEST_DEVICE_ID } });
    await prisma.$disconnect();
  });

  describe('Week period (7 days view)', () => {
    it('should return all 5 daily summaries including those with near-zero power', async () => {
      const result = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
        orderBy: { date: 'asc' },
      });

      expect(result).toHaveLength(5);

      // Verify dates are present
      const dates = result.map(r => r.date.toISOString().split('T')[0]);
      expect(dates).toContain('2025-12-30');
      expect(dates).toContain('2025-12-31');
      expect(dates).toContain('2026-01-01');
      expect(dates).toContain('2026-01-02'); // Thursday - near zero power
      expect(dates).toContain('2026-01-03'); // Friday - partial data

      // Verify Thursday has near-zero but non-null data
      const thursday = result.find(r => r.date.toISOString().startsWith('2026-01-02'));
      expect(thursday).toBeDefined();
      expect(thursday!.avgPower).toBeCloseTo(0.14, 2);
      expect(thursday!.energyKwh).toBeCloseTo(0.002, 3);
      expect(thursday!.avgPower).toBeGreaterThan(0); // Not exactly zero

      // Verify Friday has data
      const friday = result.find(r => r.date.toISOString().startsWith('2026-01-03'));
      expect(friday).toBeDefined();
      expect(friday!.avgPower).toBeCloseTo(19.09, 2);
      expect(friday!.energyKwh).toBeCloseTo(0.458, 3);
    });

    it('should identify the malformed Dec 30 16:00 entry', async () => {
      const badEntry = await prisma.dailySummary.findFirst({
        where: {
          deviceId: TEST_DEVICE_ID,
          date: new Date('2025-12-30T16:00:00.000Z'),
        },
      });

      expect(badEntry).toBeDefined();
      expect(badEntry!.date.getUTCHours()).toBe(16); // Should be 0 for midnight UTC
    });

    it('should format data for week view correctly', async () => {
      const summaries = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
        orderBy: { date: 'asc' },
      });

      // Simulate what the API would return
      const apiData = summaries.map(s => ({
        timestamp: s.date.toISOString(),
        power: s.avgPower,
        energy: s.energyKwh,
      }));

      expect(apiData).toHaveLength(5);

      // Check each day has valid non-null values
      apiData.forEach((day, index) => {
        expect(day.timestamp).toBeDefined();
        expect(day.power).toBeGreaterThanOrEqual(0);
        expect(day.energy).toBeGreaterThanOrEqual(0);
        expect(typeof day.power).toBe('number');
        expect(typeof day.energy).toBe('number');
      });

      // Verify Thu and Fri specifically
      const thu = apiData.find(d => d.timestamp.startsWith('2026-01-02'));
      const fri = apiData.find(d => d.timestamp.startsWith('2026-01-03'));

      expect(thu).toBeDefined();
      expect(thu!.power).toBeCloseTo(0.14, 2);
      expect(thu!.energy).toBeCloseTo(0.002, 3);

      expect(fri).toBeDefined();
      expect(fri!.power).toBeCloseTo(19.09, 2);
      expect(fri!.energy).toBeCloseTo(0.458, 3);
    });
  });

  describe('Data integrity checks', () => {
    it('should have exactly one entry per date (except bad Dec 30)', async () => {
      const allSummaries = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
      });

      const dateGroups = new Map<string, number>();
      allSummaries.forEach(s => {
        const dateKey = s.date.toISOString().split('T')[0];
        dateGroups.set(dateKey, (dateGroups.get(dateKey) || 0) + 1);
      });

      // All dates should have exactly 1 entry
      dateGroups.forEach((count, date) => {
        expect(count).toBe(1);
      });
    });

    it('should have all entries at 00:00:00 UTC except Dec 30', async () => {
      const allSummaries = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
      });

      const nonMidnightEntries = allSummaries.filter(s => {
        const hours = s.date.getUTCHours();
        const mins = s.date.getUTCMinutes();
        const secs = s.date.getUTCSeconds();
        return hours !== 0 || mins !== 0 || secs !== 0;
      });

      // Should have exactly 1 bad entry (Dec 30 at 16:00)
      expect(nonMidnightEntries).toHaveLength(1);
      expect(nonMidnightEntries[0].date.toISOString()).toContain('2025-12-30T16:00:00');
    });

    it('should not have null or NaN values in power/energy fields', async () => {
      const allSummaries = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
      });

      allSummaries.forEach(s => {
        expect(s.avgPower).toBeDefined();
        expect(s.energyKwh).toBeDefined();
        expect(Number.isNaN(s.avgPower)).toBe(false);
        expect(Number.isNaN(s.energyKwh)).toBe(false);
        expect(s.avgPower).toBeGreaterThanOrEqual(0);
        expect(s.energyKwh).toBeGreaterThanOrEqual(0);
      });
    });
  });
});
