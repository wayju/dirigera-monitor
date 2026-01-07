import { PrismaClient } from '@prisma/client';

export async function runHourlyAggregation(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  // Use UTC for consistency across timezones
  const previousHour = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate(),
    now.getUTCHours() - 1,
    0, 0, 0
  ));

  const hourEnd = new Date(previousHour.getTime() + 60 * 60 * 1000);

  const devices = await prisma.device.findMany();

  for (const device of devices) {
    const readings = await prisma.reading.findMany({
      where: {
        deviceId: device.id,
        timestamp: {
          gte: previousHour,
          lt: hourEnd,
        },
      },
    });

    if (readings.length === 0) continue;

    const powers = readings.map((r) => r.powerWatts);
    const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);

    // Calculate energy consumed in this hour (average power * 1 hour / 1000 = kWh)
    const energyKwh = avgPower / 1000;

    await prisma.hourlySummary.upsert({
      where: {
        deviceId_hourStart: {
          deviceId: device.id,
          hourStart: previousHour,
        },
      },
      create: {
        deviceId: device.id,
        hourStart: previousHour,
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
      update: {
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
    });
  }
}

export async function runDailyAggregation(prisma: PrismaClient): Promise<void> {
  const now = new Date();
  // Use UTC for consistency across timezones
  const yesterday = new Date(Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() - 1,
    0, 0, 0, 0
  ));

  const dayEnd = new Date(yesterday.getTime() + 24 * 60 * 60 * 1000);

  const devices = await prisma.device.findMany();

  for (const device of devices) {
    const hourlySummaries = await prisma.hourlySummary.findMany({
      where: {
        deviceId: device.id,
        hourStart: {
          gte: yesterday,
          lt: dayEnd,
        },
      },
    });

    if (hourlySummaries.length === 0) continue;

    const avgPower =
      hourlySummaries.reduce((a, b) => a + b.avgPower, 0) / hourlySummaries.length;
    const maxPower = Math.max(...hourlySummaries.map((h) => h.maxPower));
    const minPower = Math.min(...hourlySummaries.map((h) => h.minPower));
    const energyKwh = hourlySummaries.reduce((a, b) => a + b.energyKwh, 0);

    await prisma.dailySummary.upsert({
      where: {
        deviceId_date: {
          deviceId: device.id,
          date: yesterday,
        },
      },
      create: {
        deviceId: device.id,
        date: yesterday,
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
      update: {
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
    });
  }
}

export async function ensureMonthlySummary(
  prisma: PrismaClient,
  deviceId: string,
  yearMonth: string
): Promise<void> {
  // Check if summary exists
  const existing = await prisma.monthlySummary.findUnique({
    where: {
      deviceId_yearMonth: {
        deviceId,
        yearMonth,
      },
    },
  });

  if (existing) return;

  // Parse year-month
  const [year, month] = yearMonth.split('-').map(Number);
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 1);

  // Get daily summaries for that month
  const dailySummaries = await prisma.dailySummary.findMany({
    where: {
      deviceId,
      date: {
        gte: startDate,
        lt: endDate,
      },
    },
  });

  if (dailySummaries.length === 0) return;

  const avgPower =
    dailySummaries.reduce((a, b) => a + b.avgPower, 0) / dailySummaries.length;
  const maxPower = Math.max(...dailySummaries.map((d) => d.maxPower));
  const minPower = Math.min(...dailySummaries.map((d) => d.minPower));
  const energyKwh = dailySummaries.reduce((a, b) => a + b.energyKwh, 0);

  await prisma.monthlySummary.create({
    data: {
      deviceId,
      yearMonth,
      avgPower,
      maxPower,
      minPower,
      energyKwh,
    },
  });
}

export function getPreviousMonths(count: number): string[] {
  const months: string[] = [];
  const now = new Date();

  for (let i = 1; i <= count; i++) {
    const date = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const yearMonth = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
    months.push(yearMonth);
  }

  return months;
}

// Backfill missing daily summaries from hourly summaries
export async function backfillDailySummaries(
  prisma: PrismaClient,
  deviceId: string,
  daysBack: number = 30
): Promise<number> {
  let created = 0;
  const now = new Date();

  for (let i = 1; i <= daysBack; i++) {
    // Use UTC dates for consistency across timezones
    const targetDate = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate() - i,
      0, 0, 0, 0
    ));

    const dayEnd = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    // Check if daily summary exists
    const existing = await prisma.dailySummary.findUnique({
      where: {
        deviceId_date: { deviceId, date: targetDate },
      },
    });

    if (existing) continue;

    // Get hourly summaries for that day
    const hourlySummaries = await prisma.hourlySummary.findMany({
      where: {
        deviceId,
        hourStart: { gte: targetDate, lt: dayEnd },
      },
    });

    if (hourlySummaries.length === 0) continue;

    const avgPower =
      hourlySummaries.reduce((a, b) => a + b.avgPower, 0) / hourlySummaries.length;
    const maxPower = Math.max(...hourlySummaries.map((h) => h.maxPower));
    const minPower = Math.min(...hourlySummaries.map((h) => h.minPower));
    const energyKwh = hourlySummaries.reduce((a, b) => a + b.energyKwh, 0);

    await prisma.dailySummary.create({
      data: {
        deviceId,
        date: targetDate,
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
    });
    created++;
  }

  return created;
}

// Backfill missing hourly summaries from raw readings
export async function backfillHourlySummaries(
  prisma: PrismaClient,
  deviceId: string,
  hoursBack: number = 168 // 7 days
): Promise<number> {
  let created = 0;
  const now = new Date();

  for (let i = 1; i <= hoursBack; i++) {
    // Use UTC dates for consistency across timezones
    const targetHour = new Date(Date.UTC(
      now.getUTCFullYear(),
      now.getUTCMonth(),
      now.getUTCDate(),
      now.getUTCHours() - i,
      0, 0, 0
    ));

    const hourEnd = new Date(targetHour.getTime() + 60 * 60 * 1000);

    // Check if hourly summary exists
    const existing = await prisma.hourlySummary.findUnique({
      where: {
        deviceId_hourStart: { deviceId, hourStart: targetHour },
      },
    });

    if (existing) continue;

    // Get readings for that hour
    const readings = await prisma.reading.findMany({
      where: {
        deviceId,
        timestamp: { gte: targetHour, lt: hourEnd },
      },
    });

    if (readings.length === 0) continue;

    const powers = readings.map((r) => r.powerWatts);
    const avgPower = powers.reduce((a, b) => a + b, 0) / powers.length;
    const maxPower = Math.max(...powers);
    const minPower = Math.min(...powers);
    const energyKwh = avgPower / 1000;

    await prisma.hourlySummary.create({
      data: {
        deviceId,
        hourStart: targetHour,
        avgPower,
        maxPower,
        minPower,
        energyKwh,
      },
    });
    created++;
  }

  return created;
}
