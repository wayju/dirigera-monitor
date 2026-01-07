import { FastifyInstance, FastifyRequest } from 'fastify';
import { PrismaClient } from '@prisma/client';

interface ImportData {
  devices: Array<{
    id: string;
    dirigeraId: string;
    name: string;
    room: string | null;
    model: string | null;
    createdAt: string;
    updatedAt: string;
  }>;
  readings: Array<{
    id: string;
    deviceId: string;
    timestamp: string;
    powerWatts: number;
    voltage: number;
    currentAmps: number;
    energyKwh: number;
  }>;
  hourlySummaries: Array<{
    id: string;
    deviceId: string;
    hourStart: string;
    avgPower: number;
    maxPower: number;
    minPower: number;
    energyKwh: number;
  }>;
  dailySummaries: Array<{
    id: string;
    deviceId: string;
    date: string;
    avgPower: number;
    maxPower: number;
    minPower: number;
    energyKwh: number;
  }>;
  monthlySummaries: Array<{
    id: string;
    deviceId: string;
    yearMonth: string;
    avgPower: number;
    maxPower: number;
    minPower: number;
    energyKwh: number;
  }>;
}

interface ExportRequest {
  targetUrl: string;
}

interface ImportResult {
  devices: { imported: number; skipped: number };
  readings: { imported: number; skipped: number };
  hourlySummaries: { imported: number; skipped: number };
  dailySummaries: { imported: number; skipped: number };
  monthlySummaries: { imported: number; skipped: number };
}

export function registerSyncRoutes(
  app: FastifyInstance,
  prisma: PrismaClient
): void {
  // GET /api/sync/export - Export all data as JSON
  app.get('/api/sync/export', async () => {
    const [devices, readings, hourlySummaries, dailySummaries, monthlySummaries] =
      await Promise.all([
        prisma.device.findMany(),
        prisma.reading.findMany({ orderBy: { timestamp: 'asc' } }),
        prisma.hourlySummary.findMany({ orderBy: { hourStart: 'asc' } }),
        prisma.dailySummary.findMany({ orderBy: { date: 'asc' } }),
        prisma.monthlySummary.findMany({ orderBy: { yearMonth: 'asc' } }),
      ]);

    return {
      exportedAt: new Date().toISOString(),
      devices,
      readings,
      hourlySummaries,
      dailySummaries,
      monthlySummaries,
      counts: {
        devices: devices.length,
        readings: readings.length,
        hourlySummaries: hourlySummaries.length,
        dailySummaries: dailySummaries.length,
        monthlySummaries: monthlySummaries.length,
      },
    };
  });

  // POST /api/sync/import - Import bulk data, skip existing
  app.post(
    '/api/sync/import',
    async (request: FastifyRequest<{ Body: ImportData }>) => {
      const data = request.body;
      const result: ImportResult = {
        devices: { imported: 0, skipped: 0 },
        readings: { imported: 0, skipped: 0 },
        hourlySummaries: { imported: 0, skipped: 0 },
        dailySummaries: { imported: 0, skipped: 0 },
        monthlySummaries: { imported: 0, skipped: 0 },
      };

      // Build device ID mapping (source dirigeraId -> local device id)
      const deviceIdMap = new Map<string, string>();

      // Import devices first
      if (data.devices?.length) {
        for (const device of data.devices) {
          const existing = await prisma.device.findFirst({
            where: { dirigeraId: device.dirigeraId },
          });

          if (existing) {
            deviceIdMap.set(device.id, existing.id);
            result.devices.skipped++;
          } else {
            const created = await prisma.device.create({
              data: {
                dirigeraId: device.dirigeraId,
                name: device.name,
                room: device.room,
                model: device.model,
                createdAt: new Date(device.createdAt),
                updatedAt: new Date(device.updatedAt),
              },
            });
            deviceIdMap.set(device.id, created.id);
            result.devices.imported++;
          }
        }
      }

      // Import readings
      if (data.readings?.length) {
        for (const reading of data.readings) {
          const localDeviceId = deviceIdMap.get(reading.deviceId);
          if (!localDeviceId) continue;

          const timestamp = new Date(reading.timestamp);
          const existing = await prisma.reading.findFirst({
            where: {
              deviceId: localDeviceId,
              timestamp,
            },
          });

          if (existing) {
            result.readings.skipped++;
          } else {
            await prisma.reading.create({
              data: {
                deviceId: localDeviceId,
                timestamp,
                powerWatts: reading.powerWatts,
                voltage: reading.voltage,
                currentAmps: reading.currentAmps,
                energyKwh: reading.energyKwh,
              },
            });
            result.readings.imported++;
          }
        }
      }

      // Import hourly summaries
      if (data.hourlySummaries?.length) {
        for (const summary of data.hourlySummaries) {
          const localDeviceId = deviceIdMap.get(summary.deviceId);
          if (!localDeviceId) continue;

          const hourStart = new Date(summary.hourStart);
          const existing = await prisma.hourlySummary.findFirst({
            where: {
              deviceId: localDeviceId,
              hourStart,
            },
          });

          if (existing) {
            result.hourlySummaries.skipped++;
          } else {
            await prisma.hourlySummary.create({
              data: {
                deviceId: localDeviceId,
                hourStart,
                avgPower: summary.avgPower,
                maxPower: summary.maxPower,
                minPower: summary.minPower,
                energyKwh: summary.energyKwh,
              },
            });
            result.hourlySummaries.imported++;
          }
        }
      }

      // Import daily summaries
      if (data.dailySummaries?.length) {
        for (const summary of data.dailySummaries) {
          const localDeviceId = deviceIdMap.get(summary.deviceId);
          if (!localDeviceId) continue;

          const date = new Date(summary.date);
          const existing = await prisma.dailySummary.findFirst({
            where: {
              deviceId: localDeviceId,
              date,
            },
          });

          if (existing) {
            result.dailySummaries.skipped++;
          } else {
            await prisma.dailySummary.create({
              data: {
                deviceId: localDeviceId,
                date,
                avgPower: summary.avgPower,
                maxPower: summary.maxPower,
                minPower: summary.minPower,
                energyKwh: summary.energyKwh,
              },
            });
            result.dailySummaries.imported++;
          }
        }
      }

      // Import monthly summaries
      if (data.monthlySummaries?.length) {
        for (const summary of data.monthlySummaries) {
          const localDeviceId = deviceIdMap.get(summary.deviceId);
          if (!localDeviceId) continue;

          const existing = await prisma.monthlySummary.findFirst({
            where: {
              deviceId: localDeviceId,
              yearMonth: summary.yearMonth,
            },
          });

          if (existing) {
            result.monthlySummaries.skipped++;
          } else {
            await prisma.monthlySummary.create({
              data: {
                deviceId: localDeviceId,
                yearMonth: summary.yearMonth,
                avgPower: summary.avgPower,
                maxPower: summary.maxPower,
                minPower: summary.minPower,
                energyKwh: summary.energyKwh,
              },
            });
            result.monthlySummaries.imported++;
          }
        }
      }

      return {
        success: true,
        result,
      };
    }
  );

  // POST /api/sync/cleanup - Remove duplicate daily summaries and fix timezone issues
  app.post('/api/sync/cleanup', async () => {
    // Find all daily summaries
    const allSummaries = await prisma.dailySummary.findMany({
      orderBy: { date: 'asc' },
    });

    // Group by device and date (ignoring time)
    const groupedByDeviceDate = new Map<string, typeof allSummaries>();

    for (const summary of allSummaries) {
      const dateStr = summary.date.toISOString().split('T')[0];
      const key = `${summary.deviceId}:${dateStr}`;

      if (!groupedByDeviceDate.has(key)) {
        groupedByDeviceDate.set(key, []);
      }
      groupedByDeviceDate.get(key)!.push(summary);
    }

    let deleted = 0;
    let fixed = 0;
    const deletedIds: string[] = [];
    const fixedIds: string[] = [];

    // For each group, handle duplicates and non-midnight timestamps
    for (const [key, summaries] of groupedByDeviceDate) {
      // Check if any have 00:00:00 UTC
      const midnightEntry = summaries.find(s => {
        return s.date.getUTCHours() === 0 &&
               s.date.getUTCMinutes() === 0 &&
               s.date.getUTCSeconds() === 0;
      });

      if (summaries.length > 1) {
        // Multiple entries for same date - keep midnight one, delete others
        const toDelete = summaries.filter(s => s.id !== midnightEntry?.id);
        for (const summary of toDelete) {
          await prisma.dailySummary.delete({
            where: { id: summary.id },
          });
          deletedIds.push(summary.id);
          deleted++;
        }
      } else if (summaries.length === 1 && !midnightEntry) {
        // Single entry with wrong timestamp - fix it
        const summary = summaries[0];
        const correctDate = new Date(summary.date.toISOString().split('T')[0] + 'T00:00:00.000Z');

        await prisma.dailySummary.update({
          where: { id: summary.id },
          data: { date: correctDate },
        });
        fixedIds.push(summary.id);
        fixed++;
      }
    }

    return {
      success: true,
      deleted,
      deletedIds,
      fixed,
      fixedIds,
      remaining: allSummaries.length - deleted,
    };
  });

  // POST /api/sync/push - Push local data to a remote instance
  app.post(
    '/api/sync/push',
    async (request: FastifyRequest<{ Body: ExportRequest }>) => {
      const { targetUrl } = request.body;

      if (!targetUrl) {
        return { error: 'targetUrl is required' };
      }

      // Export local data
      const [devices, readings, hourlySummaries, dailySummaries, monthlySummaries] =
        await Promise.all([
          prisma.device.findMany(),
          prisma.reading.findMany({ orderBy: { timestamp: 'asc' } }),
          prisma.hourlySummary.findMany({ orderBy: { hourStart: 'asc' } }),
          prisma.dailySummary.findMany({ orderBy: { date: 'asc' } }),
          prisma.monthlySummary.findMany({ orderBy: { yearMonth: 'asc' } }),
        ]);

      const exportData = {
        devices,
        readings,
        hourlySummaries,
        dailySummaries,
        monthlySummaries,
      };

      // Push to remote
      const importUrl = targetUrl.replace(/\/$/, '') + '/api/sync/import';

      try {
        const response = await fetch(importUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(exportData),
        });

        if (!response.ok) {
          const text = await response.text();
          return {
            success: false,
            error: `Remote returned ${response.status}: ${text}`,
          };
        }

        const result = await response.json();
        return {
          success: true,
          targetUrl: importUrl,
          localCounts: {
            devices: devices.length,
            readings: readings.length,
            hourlySummaries: hourlySummaries.length,
            dailySummaries: dailySummaries.length,
            monthlySummaries: monthlySummaries.length,
          },
          remoteResult: result,
        };
      } catch (error) {
        return {
          success: false,
          error: `Failed to connect to ${importUrl}: ${error}`,
        };
      }
    }
  );
}
