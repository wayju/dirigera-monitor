import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerSyncRoutes } from './sync.js';
import { PrismaClient } from '@prisma/client';

describe('sync routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockPrisma: {
    device: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    reading: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    hourlySummary: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    dailySummary: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    monthlySummary: { findMany: ReturnType<typeof vi.fn>; findFirst: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };

  beforeEach(async () => {
    mockPrisma = {
      device: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      reading: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      hourlySummary: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      dailySummary: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
      monthlySummary: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn() },
    };

    app = Fastify();
    registerSyncRoutes(app, mockPrisma as unknown as PrismaClient);
    await app.ready();
  });

  describe('GET /api/sync/export', () => {
    it('should export all data', async () => {
      const mockDevices = [{ id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1' }];
      const mockReadings = [{ id: 'r1', deviceId: 'd1', timestamp: new Date(), powerWatts: 50 }];
      const mockHourly = [{ id: 'h1', deviceId: 'd1', hourStart: new Date() }];
      const mockDaily = [{ id: 'da1', deviceId: 'd1', date: new Date() }];
      const mockMonthly = [{ id: 'm1', deviceId: 'd1', yearMonth: '2025-01' }];

      mockPrisma.device.findMany.mockResolvedValue(mockDevices);
      mockPrisma.reading.findMany.mockResolvedValue(mockReadings);
      mockPrisma.hourlySummary.findMany.mockResolvedValue(mockHourly);
      mockPrisma.dailySummary.findMany.mockResolvedValue(mockDaily);
      mockPrisma.monthlySummary.findMany.mockResolvedValue(mockMonthly);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/export',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.devices).toHaveLength(1);
      expect(body.readings).toHaveLength(1);
      expect(body.counts.devices).toBe(1);
      expect(body.counts.readings).toBe(1);
      expect(body.exportedAt).toBeDefined();
    });

    it('should return empty arrays when no data', async () => {
      mockPrisma.device.findMany.mockResolvedValue([]);
      mockPrisma.reading.findMany.mockResolvedValue([]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);
      mockPrisma.monthlySummary.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/sync/export',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.counts.devices).toBe(0);
    });
  });

  describe('POST /api/sync/import', () => {
    it('should import new devices', async () => {
      mockPrisma.device.findFirst.mockResolvedValue(null);
      mockPrisma.device.create.mockResolvedValue({ id: 'new-id' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/import',
        headers: { 'content-type': 'application/json' },
        payload: {
          devices: [
            {
              id: 'old-id',
              dirigeraId: 'dir-1',
              name: 'Plug 1',
              room: null,
              model: 'INSPELNING',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          readings: [],
          hourlySummaries: [],
          dailySummaries: [],
          monthlySummaries: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.result.devices.imported).toBe(1);
      expect(body.result.devices.skipped).toBe(0);
    });

    it('should skip existing devices', async () => {
      mockPrisma.device.findFirst.mockResolvedValue({ id: 'existing-id', dirigeraId: 'dir-1' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/import',
        headers: { 'content-type': 'application/json' },
        payload: {
          devices: [
            {
              id: 'old-id',
              dirigeraId: 'dir-1',
              name: 'Plug 1',
              room: null,
              model: 'INSPELNING',
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          readings: [],
          hourlySummaries: [],
          dailySummaries: [],
          monthlySummaries: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.result.devices.imported).toBe(0);
      expect(body.result.devices.skipped).toBe(1);
    });

    it('should import readings with device mapping', async () => {
      mockPrisma.device.findFirst.mockResolvedValue({ id: 'local-device-id', dirigeraId: 'dir-1' });
      mockPrisma.reading.findFirst.mockResolvedValue(null);
      mockPrisma.reading.create.mockResolvedValue({});

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/import',
        headers: { 'content-type': 'application/json' },
        payload: {
          devices: [
            {
              id: 'remote-device-id',
              dirigeraId: 'dir-1',
              name: 'Plug 1',
              room: null,
              model: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          readings: [
            {
              id: 'r1',
              deviceId: 'remote-device-id',
              timestamp: '2025-01-03T10:00:00Z',
              powerWatts: 50,
              voltage: 240,
              currentAmps: 0.2,
              energyKwh: 10,
            },
          ],
          hourlySummaries: [],
          dailySummaries: [],
          monthlySummaries: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.result.readings.imported).toBe(1);
    });

    it('should skip existing readings', async () => {
      mockPrisma.device.findFirst.mockResolvedValue({ id: 'local-device-id', dirigeraId: 'dir-1' });
      mockPrisma.reading.findFirst.mockResolvedValue({ id: 'existing-reading' });

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/import',
        headers: { 'content-type': 'application/json' },
        payload: {
          devices: [
            {
              id: 'remote-device-id',
              dirigeraId: 'dir-1',
              name: 'Plug 1',
              room: null,
              model: null,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
            },
          ],
          readings: [
            {
              id: 'r1',
              deviceId: 'remote-device-id',
              timestamp: '2025-01-03T10:00:00Z',
              powerWatts: 50,
              voltage: 240,
              currentAmps: 0.2,
              energyKwh: 10,
            },
          ],
          hourlySummaries: [],
          dailySummaries: [],
          monthlySummaries: [],
        },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.result.readings.skipped).toBe(1);
    });
  });

  describe('POST /api/sync/push', () => {
    it('should return error when targetUrl is missing', async () => {
      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { 'content-type': 'application/json' },
        payload: {},
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('targetUrl is required');
    });

    it('should push data to remote endpoint', async () => {
      const mockDevices = [{ id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1' }];
      mockPrisma.device.findMany.mockResolvedValue(mockDevices);
      mockPrisma.reading.findMany.mockResolvedValue([]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);
      mockPrisma.monthlySummary.findMany.mockResolvedValue([]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, result: {} }),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { 'content-type': 'application/json' },
        payload: { targetUrl: 'http://remote:7352' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(true);
      expect(body.targetUrl).toBe('http://remote:7352/api/sync/import');
      expect(mockFetch).toHaveBeenCalledWith(
        'http://remote:7352/api/sync/import',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );
    });

    it('should handle remote connection error', async () => {
      mockPrisma.device.findMany.mockResolvedValue([]);
      mockPrisma.reading.findMany.mockResolvedValue([]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);
      mockPrisma.monthlySummary.findMany.mockResolvedValue([]);

      const mockFetch = vi.fn().mockRejectedValue(new Error('Connection refused'));
      global.fetch = mockFetch;

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { 'content-type': 'application/json' },
        payload: { targetUrl: 'http://unreachable:7352' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('Failed to connect');
    });

    it('should handle remote error response', async () => {
      mockPrisma.device.findMany.mockResolvedValue([]);
      mockPrisma.reading.findMany.mockResolvedValue([]);
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);
      mockPrisma.monthlySummary.findMany.mockResolvedValue([]);

      const mockFetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        text: () => Promise.resolve('Internal Server Error'),
      });
      global.fetch = mockFetch;

      const response = await app.inject({
        method: 'POST',
        url: '/api/sync/push',
        headers: { 'content-type': 'application/json' },
        payload: { targetUrl: 'http://remote:7352' },
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.success).toBe(false);
      expect(body.error).toContain('500');
    });
  });
});
