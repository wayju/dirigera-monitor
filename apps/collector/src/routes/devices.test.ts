import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerDeviceRoutes } from './devices.js';
import { PrismaClient } from '@prisma/client';
import { DirigeraClient, OutletReading } from '../dirigera-client.js';

describe('device routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mockPrisma: {
    device: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn> };
    reading: { findMany: ReturnType<typeof vi.fn> };
    hourlySummary: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    dailySummary: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
    monthlySummary: { findMany: ReturnType<typeof vi.fn>; findUnique: ReturnType<typeof vi.fn>; create: ReturnType<typeof vi.fn> };
  };
  let mockDirigeraClient: {
    getOutlets: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    mockPrisma = {
      device: { findMany: vi.fn(), findUnique: vi.fn() },
      reading: { findMany: vi.fn().mockResolvedValue([]) },
      hourlySummary: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      dailySummary: { findMany: vi.fn().mockResolvedValue([]), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
      monthlySummary: { findMany: vi.fn(), findUnique: vi.fn().mockResolvedValue(null), create: vi.fn() },
    };

    mockDirigeraClient = {
      getOutlets: vi.fn(),
    };

    app = Fastify();
    registerDeviceRoutes(
      app,
      mockPrisma as unknown as PrismaClient,
      mockDirigeraClient as unknown as DirigeraClient
    );
    await app.ready();
  });

  describe('GET /api/devices', () => {
    it('should return all devices', async () => {
      const mockDevices = [
        { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1', room: 'Living Room', model: 'INSPELNING' },
        { id: 'd2', dirigeraId: 'dir-2', name: 'Plug 2', room: 'Bedroom', model: 'INSPELNING' },
      ];
      mockPrisma.device.findMany.mockResolvedValue(mockDevices);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body).toHaveLength(2);
      expect(body[0].name).toBe('Plug 1');
    });

    it('should return empty array when no devices', async () => {
      mockPrisma.device.findMany.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices',
      });

      expect(response.statusCode).toBe(200);
      expect(JSON.parse(response.body)).toEqual([]);
    });
  });

  describe('GET /api/devices/:id/current', () => {
    it('should return current reading from DIRIGERA', async () => {
      const mockDevice = { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1' };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);

      const mockOutlet: OutletReading = {
        deviceId: 'dir-1',
        name: 'Plug 1',
        room: 'Living Room',
        model: 'INSPELNING',
        isOn: true,
        powerWatts: 55.5,
        voltage: 240,
        currentAmps: 0.23,
        energyKwh: 12.5,
        isReachable: true,
      };
      mockDirigeraClient.getOutlets.mockResolvedValue([mockOutlet]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/d1/current',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe('d1');
      expect(body.current.powerWatts).toBe(55.5);
      expect(body.current.isOn).toBe(true);
    });

    it('should return error if device not found in database', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/nonexistent/current',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should return error if device not found on DIRIGERA', async () => {
      const mockDevice = { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1' };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockDirigeraClient.getOutlets.mockResolvedValue([]);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/d1/current',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found on DIRIGERA');
    });
  });

  describe('GET /api/devices/:id/readings', () => {
    it('should return readings for hour period', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-03T10:30:00Z'));

      const mockDevice = { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1', room: 'Living Room' };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);

      const mockReadings = [
        { timestamp: new Date('2025-01-03T09:30:00Z'), powerWatts: 50, energyKwh: 10 },
        { timestamp: new Date('2025-01-03T10:00:00Z'), powerWatts: 60, energyKwh: 10.1 },
      ];
      mockPrisma.reading.findMany.mockResolvedValue(mockReadings);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/d1/readings?period=hour',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.device.id).toBe('d1');
      expect(body.period).toBe('hour');
      expect(body.data).toHaveLength(2);
      expect(body.summary.avgPower).toBe(55);
      expect(body.summary.maxPower).toBe(60);
      expect(body.summary.minPower).toBe(50);

      vi.useRealTimers();
    });

    it('should return error if device not found', async () => {
      mockPrisma.device.findUnique.mockResolvedValue(null);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/nonexistent/readings?period=day',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.error).toBe('Device not found');
    });

    it('should use daily summaries for week period', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-01-10T10:30:00Z'));

      const mockDevice = { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1', room: null };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);

      const mockDailySummaries = [
        { date: new Date('2025-01-05'), avgPower: 50, maxPower: 100, minPower: 10, energyKwh: 1.2 },
        { date: new Date('2025-01-06'), avgPower: 60, maxPower: 120, minPower: 20, energyKwh: 1.44 },
      ];
      mockPrisma.dailySummary.findMany.mockResolvedValue(mockDailySummaries);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/d1/readings?period=week',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('week');
      expect(body.data).toHaveLength(2);
      expect(body.summary.totalEnergy).toBeCloseTo(2.64, 2);

      vi.useRealTimers();
    });

    it('should use monthly summaries for 6months period', async () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2025-06-15T10:30:00Z'));

      const mockDevice = { id: 'd1', dirigeraId: 'dir-1', name: 'Plug 1', room: null };
      mockPrisma.device.findUnique.mockResolvedValue(mockDevice);
      mockPrisma.monthlySummary.findUnique.mockResolvedValue(null);
      mockPrisma.dailySummary.findMany.mockResolvedValue([]);

      const mockMonthlySummaries = [
        { yearMonth: '2025-05', avgPower: 50, maxPower: 100, minPower: 10, energyKwh: 36 },
        { yearMonth: '2025-04', avgPower: 55, maxPower: 110, minPower: 15, energyKwh: 40 },
      ];
      mockPrisma.monthlySummary.findMany.mockResolvedValue(mockMonthlySummaries);

      const response = await app.inject({
        method: 'GET',
        url: '/api/devices/d1/readings?period=6months',
      });

      expect(response.statusCode).toBe(200);
      const body = JSON.parse(response.body);
      expect(body.period).toBe('6months');
      expect(body.summary.totalEnergy).toBeCloseTo(76, 0);

      vi.useRealTimers();
    });
  });
});
