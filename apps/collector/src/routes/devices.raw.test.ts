import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerDeviceRoutes } from './devices.js';

// Mock Prisma client
const mockPrisma = {
  device: {
    findMany: vi.fn(),
    findUnique: vi.fn(),
  },
  reading: {
    findMany: vi.fn(),
  },
  dailySummary: {
    findMany: vi.fn(),
  },
  hourlySummary: {
    findMany: vi.fn(),
  },
  monthlySummary: {
    findMany: vi.fn(),
  },
};

// Mock DIRIGERA client
const mockDirigeraClient = {
  getOutlets: vi.fn(),
};

describe('Raw Data Endpoints', () => {
  let app: ReturnType<typeof Fastify>;

  beforeEach(async () => {
    vi.clearAllMocks();
    app = Fastify();
    registerDeviceRoutes(app as any, mockPrisma as any, mockDirigeraClient as any);
    await app.ready();
  });

  describe('GET /api/devices/:id/raw/readings', () => {
    it('should return raw readings with cumulative energy', async () => {
      const deviceId = 'device-1';
      const now = new Date();
      const readings = [
        { timestamp: new Date(now.getTime() - 3600000), powerWatts: 10, energyKwh: 0.1 },
        { timestamp: new Date(now.getTime() - 1800000), powerWatts: 15, energyKwh: 0.15 },
        { timestamp: now, powerWatts: 12, energyKwh: 0.2 },
      ];

      mockPrisma.device.findUnique.mockResolvedValue({ id: deviceId, name: 'Test Device' });
      mockPrisma.reading.findMany.mockResolvedValue(readings);

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${deviceId}/raw/readings?hours=2`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe(deviceId);
      expect(body.query.hours).toBe(2);
      expect(body.count).toBe(3);
      expect(body.readings).toHaveLength(3);
      expect(body.readings[0].energyKwh_cumulative).toBe(0.1);
    });

    it('should return error for non-existent device', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/non-existent/raw/readings',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should use default query params', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', name: 'Test' });
      mockPrisma.reading.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/device-1/raw/readings',
      });

      const body = JSON.parse(response.body);
      expect(body.query.hours).toBe(24);
      expect(body.query.limit).toBe(1000);
    });
  });

  describe('GET /api/devices/:id/raw/daily', () => {
    it('should return raw daily summaries', async () => {
      const deviceId = 'device-1';
      const summaries = [
        { date: new Date('2026-01-01'), avgPower: 10, maxPower: 20, minPower: 5, energyKwh: 0.5 },
        { date: new Date('2026-01-02'), avgPower: 12, maxPower: 22, minPower: 6, energyKwh: 0.6 },
      ];

      mockPrisma.device.findUnique.mockResolvedValue({ id: deviceId, name: 'Test Device' });
      mockPrisma.dailySummary.findMany.mockResolvedValue(summaries);

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${deviceId}/raw/daily?days=7`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe(deviceId);
      expect(body.query.days).toBe(7);
      expect(body.count).toBe(2);
      expect(body.summaries).toHaveLength(2);
      expect(body.summaries[0].avgPower).toBe(10);
    });

    it('should return error for non-existent device', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/non-existent/raw/daily',
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should use default days param', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', name: 'Test' });
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/device-1/raw/daily',
      });

      const body = JSON.parse(response.body);
      expect(body.query.days).toBe(30);
    });
  });

  describe('GET /api/devices/:id/raw/hourly', () => {
    it('should return raw hourly summaries', async () => {
      const deviceId = 'device-1';
      const summaries = [
        { hourStart: new Date('2026-01-06T10:00:00Z'), avgPower: 10, maxPower: 15, minPower: 5, energyKwh: 0.01 },
        { hourStart: new Date('2026-01-06T11:00:00Z'), avgPower: 12, maxPower: 18, minPower: 6, energyKwh: 0.012 },
      ];

      mockPrisma.device.findUnique.mockResolvedValue({ id: deviceId, name: 'Test Device' });
      mockPrisma.hourlySummary.findMany.mockResolvedValue(summaries);

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${deviceId}/raw/hourly?hours=24`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe(deviceId);
      expect(body.query.hours).toBe(24);
      expect(body.count).toBe(2);
      expect(body.summaries).toHaveLength(2);
      expect(body.summaries[0].hour).toBeDefined();
    });

    it('should return error for non-existent device', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/non-existent/raw/hourly',
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should use default hours param (168 = 7 days)', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', name: 'Test' });
      mockPrisma.hourlySummary.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/device-1/raw/hourly',
      });

      const body = JSON.parse(response.body);
      expect(body.query.hours).toBe(168);
    });
  });

  describe('GET /api/devices/:id/raw/monthly', () => {
    it('should return raw monthly summaries', async () => {
      const deviceId = 'device-1';
      const summaries = [
        { yearMonth: '2025-12', avgPower: 10, maxPower: 50, minPower: 2, energyKwh: 5.5 },
        { yearMonth: '2026-01', avgPower: 12, maxPower: 55, minPower: 3, energyKwh: 6.2 },
      ];

      mockPrisma.device.findUnique.mockResolvedValue({ id: deviceId, name: 'Test Device' });
      mockPrisma.monthlySummary.findMany.mockResolvedValue(summaries);

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${deviceId}/raw/monthly`,
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe(deviceId);
      expect(body.count).toBe(2);
      expect(body.summaries).toHaveLength(2);
      expect(body.summaries[0].yearMonth).toBe('2025-12');
      expect(body.summaries[0].energyKwh).toBe(5.5);
    });

    it('should return error for non-existent device', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/non-existent/raw/monthly',
      });

      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should return empty array when no monthly summaries exist', async () => {
      mockPrisma.device.findUnique.mockResolvedValue({ id: 'device-1', name: 'Test' });
      mockPrisma.monthlySummary.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/device-1/raw/monthly',
      });

      const body = JSON.parse(response.body);
      expect(body.count).toBe(0);
      expect(body.summaries).toEqual([]);
    });
  });
});
