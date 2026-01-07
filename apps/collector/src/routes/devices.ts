import { FastifyInstance, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { DirigeraClient } from '../dirigera-client.js';
import {
  ensureMonthlySummary,
  getPreviousMonths,
  backfillHourlySummaries,
  backfillDailySummaries,
} from '../aggregation.js';

type Period = 'hour' | 'day' | 'week' | 'month' | '6months';

interface DailySummaryData {
  date: Date;
  avgPower: number;
  maxPower: number;
  minPower: number;
  energyKwh: number;
}

interface WeeklySummaryData {
  timestamp: Date;
  power: number;
  energy: number;
}

// Group daily summaries into weekly aggregates
function aggregateDailySummariesByWeek(
  dailySummaries: DailySummaryData[],
  weekCount: number
): WeeklySummaryData[] {
  if (dailySummaries.length === 0) return [];

  // Helper to get start of week (Monday 00:00 UTC)
  function getWeekStart(date: Date): Date {
    const d = new Date(date);
    d.setUTCHours(0, 0, 0, 0);
    const day = d.getUTCDay();
    const diff = (day < 1 ? 7 : 0) + day - 1; // Monday = 1
    return new Date(d.getTime() - diff * 24 * 60 * 60 * 1000);
  }

  // Group daily summaries by week
  const weeklyGroups = new Map<string, DailySummaryData[]>();
  for (const summary of dailySummaries) {
    const weekStart = getWeekStart(summary.date);
    const weekKey = weekStart.toISOString();
    if (!weeklyGroups.has(weekKey)) {
      weeklyGroups.set(weekKey, []);
    }
    weeklyGroups.get(weekKey)!.push(summary);
  }

  // Convert to weekly summaries
  const weeklySummaries: WeeklySummaryData[] = [];
  for (const [weekKey, summaries] of weeklyGroups) {
    const avgPower = summaries.reduce((sum, s) => sum + s.avgPower, 0) / summaries.length;
    const energyKwh = summaries.reduce((sum, s) => sum + s.energyKwh, 0);

    weeklySummaries.push({
      timestamp: new Date(weekKey),
      power: avgPower,
      energy: energyKwh,
    });
  }

  // Sort by timestamp
  weeklySummaries.sort((a, b) => a.timestamp.getTime() - b.timestamp.getTime());

  return weeklySummaries;
}

interface ReadingsQuery {
  period?: Period;
}

interface DeviceParams {
  id: string;
}

// Helper: Calculate today's partial data from raw readings
async function getTodaysPartialData(
  prisma: PrismaClient,
  deviceId: string,
  now: Date
): Promise<DailySummaryData | null> {
  const todayStart = new Date(now);
  todayStart.setUTCHours(0, 0, 0, 0);

  const readings = await prisma.reading.findMany({
    where: { deviceId, timestamp: { gte: todayStart } },
    orderBy: { timestamp: 'asc' },
  });

  if (readings.length === 0) return null;

  if (readings.length === 1) {
    return {
      date: todayStart,
      avgPower: readings[0].powerWatts,
      maxPower: readings[0].powerWatts,
      minPower: readings[0].powerWatts,
      energyKwh: 0, // No delta with single reading
    };
  }

  // Calculate energy delta from first to last reading
  let energyKwh = readings[readings.length - 1].energyKwh - readings[0].energyKwh;
  if (energyKwh < 0) energyKwh = 0; // Handle meter resets

  const powers = readings.map((r) => r.powerWatts);
  return {
    date: todayStart,
    avgPower: powers.reduce((a, b) => a + b, 0) / powers.length,
    maxPower: Math.max(...powers),
    minPower: Math.min(...powers),
    energyKwh,
  };
}

// Helper: Get daily summaries and append today's partial data
async function getDailySummariesWithToday(
  prisma: PrismaClient,
  deviceId: string,
  daysBack: number,
  now: Date
): Promise<DailySummaryData[]> {
  const since = new Date(now.getTime() - daysBack * 24 * 60 * 60 * 1000);
  const dailySummaries = await prisma.dailySummary.findMany({
    where: { deviceId, date: { gte: since } },
    orderBy: { date: 'asc' },
  });

  const result: DailySummaryData[] = dailySummaries.map((d) => ({
    date: d.date,
    avgPower: d.avgPower,
    maxPower: d.maxPower,
    minPower: d.minPower,
    energyKwh: d.energyKwh,
  }));

  // Add today's partial data
  const todayPartial = await getTodaysPartialData(prisma, deviceId, now);
  if (todayPartial) {
    result.push(todayPartial);
  }

  return result;
}

// Helper: Calculate summary stats from daily data
function calculateSummaryFromDaily(dailyData: DailySummaryData[]): {
  avgPower: number;
  maxPower: number;
  minPower: number;
  totalEnergy: number;
} {
  if (dailyData.length === 0) {
    return { avgPower: 0, maxPower: 0, minPower: 0, totalEnergy: 0 };
  }

  return {
    avgPower: dailyData.reduce((sum, d) => sum + d.avgPower, 0) / dailyData.length,
    maxPower: Math.max(...dailyData.map((d) => d.maxPower)),
    minPower: Math.min(...dailyData.map((d) => d.minPower)),
    totalEnergy: dailyData.reduce((sum, d) => sum + d.energyKwh, 0),
  };
}

// Helper: Get current month's data from daily summaries + today's partial
async function getCurrentMonthData(
  prisma: PrismaClient,
  deviceId: string,
  now: Date
): Promise<DailySummaryData | null> {
  const currentMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0));

  // Get daily summaries for current month
  const dailySummaries = await prisma.dailySummary.findMany({
    where: { deviceId, date: { gte: currentMonthStart } },
    orderBy: { date: 'asc' },
  });

  // Get today's partial
  const todayPartial = await getTodaysPartialData(prisma, deviceId, now);

  // Combine daily summaries + today's partial
  const allData: DailySummaryData[] = dailySummaries.map((d) => ({
    date: d.date,
    avgPower: d.avgPower,
    maxPower: d.maxPower,
    minPower: d.minPower,
    energyKwh: d.energyKwh,
  }));

  if (todayPartial) {
    allData.push(todayPartial);
  }

  if (allData.length === 0) return null;

  // Aggregate into single monthly data point
  const summary = calculateSummaryFromDaily(allData);
  return {
    date: currentMonthStart,
    avgPower: summary.avgPower,
    maxPower: summary.maxPower,
    minPower: summary.minPower,
    energyKwh: summary.totalEnergy,
  };
}

export function registerDeviceRoutes(
  app: FastifyInstance,
  prisma: PrismaClient,
  dirigeraClient: DirigeraClient
): void {
  // GET /api/devices - List all devices
  app.get('/api/devices', async () => {
    const devices = await prisma.device.findMany({
      orderBy: { name: 'asc' },
    });
    return devices;
  });

  // GET /api/devices/:id/current - Get current reading from DIRIGERA
  app.get(
    '/api/devices/:id/current',
    async (request: FastifyRequest<{ Params: DeviceParams }>) => {
      const { id } = request.params;

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const outlets = await dirigeraClient.getOutlets();
      const outlet = outlets.find((o) => o.deviceId === device.dirigeraId);

      if (!outlet) {
        return { error: 'Device not found on DIRIGERA' };
      }

      return {
        device: {
          id: device.id,
          name: device.name,
          room: device.room,
        },
        current: {
          isOn: outlet.isOn,
          powerWatts: outlet.powerWatts,
          voltage: outlet.voltage,
          currentAmps: outlet.currentAmps,
          energyKwh: outlet.energyKwh,
          isReachable: outlet.isReachable,
        },
      };
    }
  );

  // GET /api/devices/:id/readings?period=hour|day|week|month|6months
  app.get(
    '/api/devices/:id/readings',
    async (
      request: FastifyRequest<{ Params: DeviceParams; Querystring: ReadingsQuery }>
    ) => {
      const { id } = request.params;
      const period = request.query.period || 'day';

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const now = new Date();
      let data: Array<{ timestamp: Date; power: number; energy: number }> = [];
      let summary = { avgPower: 0, maxPower: 0, minPower: 0, totalEnergy: 0 };

      switch (period) {
        case 'hour': {
          // Return last 24 hours of raw readings with energy DELTAS (not cumulative)
          const twentyFourHoursAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
          const readings = await prisma.reading.findMany({
            where: { deviceId: id, timestamp: { gte: twentyFourHoursAgo } },
            orderBy: { timestamp: 'asc' },
          });

          // Convert cumulative energy to deltas
          let totalEnergyDelta = 0;
          for (let i = 0; i < readings.length; i++) {
            const r = readings[i];
            // Calculate energy delta from previous reading
            let energyDelta = 0;
            if (i > 0) {
              const prevEnergy = readings[i - 1].energyKwh;
              energyDelta = r.energyKwh - prevEnergy;
              // Ignore negative deltas (meter resets or errors)
              if (energyDelta < 0) energyDelta = 0;
            }
            totalEnergyDelta += energyDelta;
            data.push({
              timestamp: r.timestamp,
              power: r.powerWatts,
              energy: energyDelta, // Delta, not cumulative
            });
          }

          if (readings.length > 0) {
            const powers = readings.map((r) => r.powerWatts);
            summary = {
              avgPower: powers.reduce((a, b) => a + b, 0) / powers.length,
              maxPower: Math.max(...powers),
              minPower: Math.min(...powers),
              totalEnergy: totalEnergyDelta,
            };
          }
          break;
        }

        case 'day': {
          // Backfill any missing summaries first
          await backfillHourlySummaries(prisma, id, 168); // 7 days
          await backfillDailySummaries(prisma, id, 7);

          // Get daily summaries including today's partial data
          const dailyData = await getDailySummariesWithToday(prisma, id, 7, now);

          if (dailyData.length > 0) {
            data = dailyData.map((d) => ({
              timestamp: d.date,
              power: d.avgPower,
              energy: d.energyKwh,
            }));
            summary = calculateSummaryFromDaily(dailyData);
          }
          break;
        }

        case 'week': {
          // Backfill any missing summaries first
          await backfillHourlySummaries(prisma, id, 168); // 7 days
          await backfillDailySummaries(prisma, id, 35);

          // Get daily summaries including today's partial data
          const weekDailyData = await getDailySummariesWithToday(prisma, id, 35, now);

          if (weekDailyData.length > 0) {
            // Aggregate daily summaries into weekly summaries
            const weeklySummaries = aggregateDailySummariesByWeek(weekDailyData, 5);

            data = weeklySummaries.map((w) => ({
              timestamp: w.timestamp,
              power: w.power,
              energy: w.energy,
            }));

            summary = calculateSummaryFromDaily(weekDailyData);
          }
          break;
        }

        case 'month': {
          // Backfill any missing summaries first
          await backfillHourlySummaries(prisma, id, 720); // 30 days
          await backfillDailySummaries(prisma, id, 90);

          // Get daily summaries including today's partial data
          const monthDailyData = await getDailySummariesWithToday(prisma, id, 90, now);

          if (monthDailyData.length > 0) {
            // Aggregate daily summaries into weekly summaries (~13 weeks)
            const weeklySummaries = aggregateDailySummariesByWeek(monthDailyData, 13);

            data = weeklySummaries.map((w) => ({
              timestamp: w.timestamp,
              power: w.power,
              energy: w.energy,
            }));

            summary = calculateSummaryFromDaily(monthDailyData);
          }
          break;
        }

        case '6months': {
          // Backfill any missing summaries first
          await backfillHourlySummaries(prisma, id, 720); // 30 days
          await backfillDailySummaries(prisma, id, 90); // 3 months

          // Ensure monthly summaries exist for previous months (excludes current month)
          const previousMonths = getPreviousMonths(5); // Only 5 previous months
          for (const yearMonth of previousMonths) {
            await ensureMonthlySummary(prisma, id, yearMonth);
          }

          const monthly = await prisma.monthlySummary.findMany({
            where: { deviceId: id, yearMonth: { in: previousMonths } },
            orderBy: { yearMonth: 'asc' },
          });

          // Get current month's partial data
          const currentMonth = await getCurrentMonthData(prisma, id, now);

          // Build data array from monthly summaries
          data = monthly.map((m) => {
            const [year, month] = m.yearMonth.split('-').map(Number);
            return {
              timestamp: new Date(Date.UTC(year, month - 1, 1)),
              power: m.avgPower,
              energy: m.energyKwh,
            };
          });

          // Add current month's partial data
          if (currentMonth) {
            data.push({
              timestamp: currentMonth.date,
              power: currentMonth.avgPower,
              energy: currentMonth.energyKwh,
            });
          }

          // Build all monthly data for summary calculation
          const allMonthlyData: DailySummaryData[] = monthly.map((m) => {
            const [year, month] = m.yearMonth.split('-').map(Number);
            return {
              date: new Date(Date.UTC(year, month - 1, 1)),
              avgPower: m.avgPower,
              maxPower: m.maxPower,
              minPower: m.minPower,
              energyKwh: m.energyKwh,
            };
          });
          if (currentMonth) {
            allMonthlyData.push(currentMonth);
          }

          if (allMonthlyData.length > 0) {
            summary = calculateSummaryFromDaily(allMonthlyData);
          }
          break;
        }
      }

      return {
        device: { id: device.id, name: device.name, room: device.room },
        period,
        data,
        summary,
      };
    }
  );

  // DEBUG ENDPOINTS - Raw data access for troubleshooting

  // GET /api/devices/:id/raw/readings - Raw readings with cumulative energy
  app.get(
    '/api/devices/:id/raw/readings',
    async (
      request: FastifyRequest<{
        Params: DeviceParams;
        Querystring: { hours?: string; limit?: string };
      }>
    ) => {
      const { id } = request.params;
      const hours = parseInt(request.query.hours || '24', 10);
      const limit = parseInt(request.query.limit || '1000', 10);

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const readings = await prisma.reading.findMany({
        where: { deviceId: id, timestamp: { gte: since } },
        orderBy: { timestamp: 'asc' },
        take: limit,
      });

      return {
        device: { id: device.id, name: device.name },
        query: { hours, limit, since: since.toISOString() },
        count: readings.length,
        readings: readings.map((r) => ({
          timestamp: r.timestamp,
          powerWatts: r.powerWatts,
          energyKwh_cumulative: r.energyKwh,
        })),
      };
    }
  );

  // GET /api/devices/:id/raw/daily - Raw daily summaries
  app.get(
    '/api/devices/:id/raw/daily',
    async (
      request: FastifyRequest<{
        Params: DeviceParams;
        Querystring: { days?: string };
      }>
    ) => {
      const { id } = request.params;
      const days = parseInt(request.query.days || '30', 10);

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const summaries = await prisma.dailySummary.findMany({
        where: { deviceId: id, date: { gte: since } },
        orderBy: { date: 'asc' },
      });

      return {
        device: { id: device.id, name: device.name },
        query: { days, since: since.toISOString() },
        count: summaries.length,
        summaries: summaries.map((s) => ({
          date: s.date,
          avgPower: s.avgPower,
          maxPower: s.maxPower,
          minPower: s.minPower,
          energyKwh: s.energyKwh,
        })),
      };
    }
  );

  // GET /api/devices/:id/raw/hourly - Raw hourly summaries
  app.get(
    '/api/devices/:id/raw/hourly',
    async (
      request: FastifyRequest<{
        Params: DeviceParams;
        Querystring: { hours?: string };
      }>
    ) => {
      const { id } = request.params;
      const hours = parseInt(request.query.hours || '168', 10); // Default 7 days

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const since = new Date(Date.now() - hours * 60 * 60 * 1000);
      const summaries = await prisma.hourlySummary.findMany({
        where: { deviceId: id, hourStart: { gte: since } },
        orderBy: { hourStart: 'asc' },
      });

      return {
        device: { id: device.id, name: device.name },
        query: { hours, since: since.toISOString() },
        count: summaries.length,
        summaries: summaries.map((s) => ({
          hour: s.hourStart,
          avgPower: s.avgPower,
          maxPower: s.maxPower,
          minPower: s.minPower,
          energyKwh: s.energyKwh,
        })),
      };
    }
  );

  // GET /api/devices/:id/raw/monthly - Raw monthly summaries
  app.get(
    '/api/devices/:id/raw/monthly',
    async (request: FastifyRequest<{ Params: DeviceParams }>) => {
      const { id } = request.params;

      const device = await prisma.device.findUnique({ where: { id } });
      if (!device) {
        return { error: 'Device not found' };
      }

      const summaries = await prisma.monthlySummary.findMany({
        where: { deviceId: id },
        orderBy: { yearMonth: 'asc' },
      });

      return {
        device: { id: device.id, name: device.name },
        count: summaries.length,
        summaries: summaries.map((s) => ({
          yearMonth: s.yearMonth,
          avgPower: s.avgPower,
          maxPower: s.maxPower,
          minPower: s.minPower,
          energyKwh: s.energyKwh,
        })),
      };
    }
  );
}
