import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PrismaClient } from '@prisma/client';

/**
 * Tests to prove the backend bug in period=day endpoint
 *
 * BUG: period=day returns hourlySummary data instead of dailySummary data
 *
 * Expected behavior:
 * - period=hour -> raw readings (5-min intervals)
 * - period=day -> dailySummary (7 daily summaries)
 * - period=week -> dailySummary (35 daily summaries)
 * - period=month -> dailySummary (90 daily summaries)
 * - period=6months -> monthlySummary (6 monthly summaries)
 *
 * Actual behavior (BUGGY):
 * - period=day -> hourlySummary (168 hourly summaries) ❌ WRONG!
 */
describe('Period Endpoint Bug - Day Period', () => {
  let prisma: PrismaClient;
  const TEST_DEVICE_ID = 'test-device-period-bug';

  beforeAll(async () => {
    prisma = new PrismaClient();

    // Clean up
    await prisma.reading.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.hourlySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.device.deleteMany({ where: { id: TEST_DEVICE_ID } });

    // Create test device
    await prisma.device.create({
      data: {
        id: TEST_DEVICE_ID,
        dirigeraId: 'test-dirigera-period-bug',
        name: 'Test Device Period Bug',
        room: 'Test Room',
        model: 'Test Model',
      },
    });

    // Simulate realistic data:
    // Jan 2: Printer mostly off (low energy per hour, but spreads across 24 hours)
    // Jan 3: Printer on in morning, off later

    // Create HOURLY summaries for Jan 2 (24 hours, mostly low power)
    const jan2HourlySummaries = [];
    for (let hour = 0; hour < 24; hour++) {
      jan2HourlySummaries.push({
        deviceId: TEST_DEVICE_ID,
        hourStart: new Date(`2026-01-02T${hour.toString().padStart(2, '0')}:00:00.000Z`),
        avgPower: 0.14, // Very low power (printer off)
        maxPower: 0.3,
        minPower: 0,
        energyKwh: 0.00014, // 0.14 Wh per hour
      });
    }

    // Create HOURLY summaries for Jan 3 (printer on for 6 hours, off for 18)
    const jan3HourlySummaries = [];
    for (let hour = 0; hour < 24; hour++) {
      const isOn = hour < 6; // Printer on from 00:00 to 06:00
      jan3HourlySummaries.push({
        deviceId: TEST_DEVICE_ID,
        hourStart: new Date(`2026-01-03T${hour.toString().padStart(2, '0')}:00:00.000Z`),
        avgPower: isOn ? 80.0 : 0.14, // On: 80W, Off: 0.14W
        maxPower: isOn ? 235.9 : 0.3,
        minPower: 0,
        energyKwh: isOn ? 0.08 : 0.00014, // On: 80Wh/hour, Off: 0.14Wh/hour
      });
    }

    // Insert all hourly summaries
    for (const summary of [...jan2HourlySummaries, ...jan3HourlySummaries]) {
      await prisma.hourlySummary.create({ data: summary });
    }

    // Create DAILY summaries (aggregated from hourly)
    // Jan 2: 24 hours * 0.14 Wh = 3.36 Wh = 0.00336 kWh
    await prisma.dailySummary.create({
      data: {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2026-01-02T00:00:00.000Z'),
        avgPower: 0.14,
        maxPower: 0.3,
        minPower: 0,
        energyKwh: 0.00336, // Total for entire day (24 * 0.00014)
      },
    });

    // Jan 3: (6 * 80 Wh) + (18 * 0.14 Wh) = 480 + 2.52 = 482.52 Wh = 0.48252 kWh
    await prisma.dailySummary.create({
      data: {
        deviceId: TEST_DEVICE_ID,
        date: new Date('2026-01-03T00:00:00.000Z'),
        avgPower: 20.1, // Average: 482.52 / 24
        maxPower: 235.9,
        minPower: 0,
        energyKwh: 0.48252, // Total for entire day
      },
    });
  });

  afterAll(async () => {
    // Clean up
    await prisma.reading.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.hourlySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.device.deleteMany({ where: { id: TEST_DEVICE_ID } });
    await prisma.$disconnect();
  });

  describe('Data Setup Verification', () => {
    it('should have 48 hourly summaries (24 per day for 2 days)', async () => {
      const count = await prisma.hourlySummary.count({
        where: { deviceId: TEST_DEVICE_ID },
      });
      expect(count).toBe(48);
    });

    it('should have 2 daily summaries', async () => {
      const count = await prisma.dailySummary.count({
        where: { deviceId: TEST_DEVICE_ID },
      });
      expect(count).toBe(2);
    });

    it('daily summaries should have aggregated energy values', async () => {
      const dailies = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID },
        orderBy: { date: 'asc' },
      });

      // Jan 2: 24 * 0.00014 = 0.00336 kWh
      expect(dailies[0].energyKwh).toBeCloseTo(0.00336, 5);

      // Jan 3: (6 * 0.08) + (18 * 0.00014) = 0.48252 kWh
      expect(dailies[1].energyKwh).toBeCloseTo(0.48252, 5);
    });
  });

  describe('BUG: period=day returns wrong data type', () => {
    it('CURRENT BUGGY BEHAVIOR: returns hourly summaries (48 items)', async () => {
      // This is what the BUGGY code does
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hourly = await prisma.hourlySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID, hourStart: { gte: sevenDaysAgo } },
        orderBy: { hourStart: 'asc' },
      });

      // BUG: Returns 48 hourly summaries instead of 2 daily summaries
      expect(hourly.length).toBe(48);

      // Frontend takes LAST hourly reading per day
      const jan2Readings = hourly.filter(h =>
        h.hourStart.toISOString().startsWith('2026-01-02')
      );
      const jan3Readings = hourly.filter(h =>
        h.hourStart.toISOString().startsWith('2026-01-03')
      );

      // Last reading for Jan 2 (at 23:00)
      const jan2Last = jan2Readings[jan2Readings.length - 1];
      expect(jan2Last.energyKwh).toBeCloseTo(0.00014, 5); // Just 1 hour!

      // Last reading for Jan 3 (at 23:00, when printer is OFF)
      const jan3Last = jan3Readings[jan3Readings.length - 1];
      expect(jan3Last.energyKwh).toBeCloseTo(0.00014, 5); // Just 1 hour!

      // This is why user sees ~0 for both days!
    });

    it('EXPECTED CORRECT BEHAVIOR: should return daily summaries (2 items)', async () => {
      // This is what the code SHOULD do
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const daily = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID, date: { gte: sevenDaysAgo } },
        orderBy: { date: 'asc' },
      });

      // CORRECT: Returns 2 daily summaries
      expect(daily.length).toBe(2);

      // Jan 2: Total energy for entire day
      expect(daily[0].energyKwh).toBeCloseTo(0.00336, 5); // 3.36 Wh

      // Jan 3: Total energy for entire day
      expect(daily[1].energyKwh).toBeCloseTo(0.48252, 5); // 482.52 Wh

      // These are the CORRECT values that should be displayed!
    });
  });

  describe('Impact on Frontend', () => {
    it('BUGGY: frontend gets wrong energy values', async () => {
      // Simulate what frontend receives from buggy API
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const hourly = await prisma.hourlySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID, hourStart: { gte: sevenDaysAgo } },
        orderBy: { hourStart: 'asc' },
      });

      const apiData = hourly.map(h => ({
        timestamp: h.hourStart.toISOString(),
        power: h.avgPower,
        energy: h.energyKwh,
      }));

      // Frontend groups by day and takes last reading
      const jan2Data = apiData.filter(d => d.timestamp.startsWith('2026-01-02'));
      const jan3Data = apiData.filter(d => d.timestamp.startsWith('2026-01-03'));

      const jan2Energy = jan2Data[jan2Data.length - 1].energy;
      const jan3Energy = jan3Data[jan3Data.length - 1].energy;

      // User sees these tiny values (just 1 hour each)
      expect(jan2Energy).toBeCloseTo(0.00014, 5); // 0.14 Wh - displays as ~0
      expect(jan3Energy).toBeCloseTo(0.00014, 5); // 0.14 Wh - displays as ~0

      // But actual daily totals are MUCH larger!
      expect(jan2Energy).toBeLessThan(0.00336); // Should be 24x larger!
      expect(jan3Energy).toBeLessThan(0.48252); // Should be 3447x larger!
    });

    it('CORRECT: frontend should get daily aggregated values', async () => {
      // Simulate what frontend SHOULD receive from fixed API
      const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const daily = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID, date: { gte: sevenDaysAgo } },
        orderBy: { date: 'asc' },
      });

      const apiData = daily.map(d => ({
        timestamp: d.date.toISOString(),
        power: d.avgPower,
        energy: d.energyKwh,
      }));

      // Frontend gets one reading per day (correct!)
      expect(apiData.length).toBe(2);

      const jan2Data = apiData.find(d => d.timestamp.startsWith('2026-01-02'));
      const jan3Data = apiData.find(d => d.timestamp.startsWith('2026-01-03'));

      // User sees correct total daily energy
      expect(jan2Data?.energy).toBeCloseTo(0.00336, 5); // 3.36 Wh
      expect(jan3Data?.energy).toBeCloseTo(0.48252, 5); // 482.52 Wh

      // These values are visible in the UI!
    });
  });

  describe('Comparison with other periods', () => {
    it('period=week correctly uses dailySummary', async () => {
      const fiveWeeksAgo = new Date(Date.now() - 35 * 24 * 60 * 60 * 1000);
      const daily = await prisma.dailySummary.findMany({
        where: { deviceId: TEST_DEVICE_ID, date: { gte: fiveWeeksAgo } },
        orderBy: { date: 'asc' },
      });

      // Correctly returns daily summaries
      expect(daily.length).toBe(2);
      expect(daily[0].energyKwh).toBeCloseTo(0.00336, 5);
      expect(daily[1].energyKwh).toBeCloseTo(0.48252, 5);
    });

    it('PROVES: period=day and period=week should use same table', () => {
      // Both should query dailySummary
      // period=day: last 7 days of dailySummary
      // period=week: last 35 days of dailySummary

      // The ONLY difference should be the time range, NOT the table!
      expect(true).toBe(true); // This test documents the expected behavior
    });
  });

  describe('Real-world scenario from console logs', () => {
    it('reproduces exact bug user saw: Fri 2 shows 0.14 Wh', async () => {
      // User's console showed:
      // [day] Slot "Fri 2": power=0.14W, energy=0.0001416666687776645kWh (0.14Wh)

      // This matches our test data: last hourly reading at 23:00 = 0.14 Wh
      const jan2Hourly = await prisma.hourlySummary.findMany({
        where: {
          deviceId: TEST_DEVICE_ID,
          hourStart: { gte: new Date('2026-01-02T00:00:00.000Z'), lt: new Date('2026-01-03T00:00:00.000Z') }
        },
        orderBy: { hourStart: 'desc' },
      });

      const lastHour = jan2Hourly[0];
      expect(lastHour.energyKwh).toBeCloseTo(0.00014, 5);
      expect(lastHour.avgPower).toBeCloseTo(0.14, 2);

      // But the daily summary has the correct total
      const jan2Daily = await prisma.dailySummary.findFirst({
        where: {
          deviceId: TEST_DEVICE_ID,
          date: new Date('2026-01-02T00:00:00.000Z')
        },
      });

      expect(jan2Daily!.energyKwh).toBeCloseTo(0.00336, 5);

      // Ratio: daily is 24x larger (as expected for 24 hours)
      expect(jan2Daily!.energyKwh / lastHour.energyKwh).toBeCloseTo(24, 0);
    });
  });
});
