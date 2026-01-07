import cron from 'node-cron';
import { PrismaClient } from '@prisma/client';
import { DirigeraClient } from './dirigera-client.js';
import { config } from './config.js';
import { runHourlyAggregation, runDailyAggregation } from './aggregation.js';

const prisma = new PrismaClient();

export async function collectReadings(client: DirigeraClient): Promise<number> {
  const outlets = await client.getOutlets();
  let savedCount = 0;

  for (const outlet of outlets) {
    // Upsert device
    const device = await prisma.device.upsert({
      where: { dirigeraId: outlet.deviceId },
      create: {
        dirigeraId: outlet.deviceId,
        name: outlet.name,
        room: outlet.room,
        model: outlet.model,
      },
      update: {
        name: outlet.name,
        room: outlet.room,
        model: outlet.model,
      },
    });

    // Save reading if device is reachable
    if (outlet.isReachable) {
      await prisma.reading.create({
        data: {
          deviceId: device.id,
          powerWatts: outlet.powerWatts,
          voltage: outlet.voltage,
          currentAmps: outlet.currentAmps,
          energyKwh: outlet.energyKwh,
        },
      });
      savedCount++;
    }
  }

  return savedCount;
}

export function startScheduler(client: DirigeraClient): void {
  const intervalMinutes = config.pollIntervalMinutes;

  // Poll every N minutes
  cron.schedule(`*/${intervalMinutes} * * * *`, async () => {
    try {
      const count = await collectReadings(client);
      console.log(`[${new Date().toISOString()}] Collected ${count} readings`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Collection error:`, error);
    }
  });

  // Hourly aggregation at :05 past each hour
  cron.schedule('5 * * * *', async () => {
    try {
      await runHourlyAggregation(prisma);
      console.log(`[${new Date().toISOString()}] Hourly aggregation complete`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Hourly aggregation error:`, error);
    }
  });

  // Daily aggregation at 00:10
  cron.schedule('10 0 * * *', async () => {
    try {
      await runDailyAggregation(prisma);
      console.log(`[${new Date().toISOString()}] Daily aggregation complete`);
    } catch (error) {
      console.error(`[${new Date().toISOString()}] Daily aggregation error:`, error);
    }
  });

  console.log(`Scheduler started: polling every ${intervalMinutes} minutes`);
}
