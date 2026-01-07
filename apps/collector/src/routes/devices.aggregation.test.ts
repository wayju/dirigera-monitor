import { describe, it, expect } from 'vitest';
import { FastifyInstance } from 'fastify';
import Fastify from 'fastify';
import { PrismaClient } from '@prisma/client';
import { registerDeviceRoutes } from './devices.js';
import { DirigeraClient } from '../dirigera-client.js';

/**
 * Tests for backend weekly aggregation logic
 *
 * This tests the critical function that groups daily summaries into weekly summaries
 * for the week and month period endpoints.
 */
describe('Backend Weekly Aggregation - Week/Month Periods', () => {
  let app: FastifyInstance;
  let prisma: PrismaClient;
  const TEST_DEVICE_ID = 'test-device-aggregation';

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
        dirigeraId: 'test-dirigera-aggregation',
        name: 'Test Device Aggregation',
        room: 'Test Room',
        model: 'Test Model',
      },
    });

    // Setup Fastify app with routes
    app = Fastify();
    const mockDirigeraClient = {
      getOutlets: async () => [],
    } as unknown as DirigeraClient;
    registerDeviceRoutes(app, prisma, mockDirigeraClient);
  });

  afterAll(async () => {
    await prisma.reading.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.hourlySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });
    await prisma.device.deleteMany({ where: { id: TEST_DEVICE_ID } });
    await prisma.$disconnect();
    await app.close();
  });

  describe('Week Period - Aggregates 35 days into 5 weeks', () => {
    it('should group daily summaries by week and SUM energies', async () => {
      // Create 35 days of daily summaries (5 weeks)
      const dailySummaries = [];
      const now = new Date();

      for (let i = 0; i < 35; i++) {
        const date = new Date(now.getTime() - (34 - i) * 24 * 60 * 60 * 1000);
        date.setUTCHours(0, 0, 0, 0);

        // Each day has 100 Wh (0.1 kWh)
        dailySummaries.push({
          deviceId: TEST_DEVICE_ID,
          date,
          avgPower: 10,
          maxPower: 20,
          minPower: 0,
          energyKwh: 0.1, // 100 Wh per day
        });
      }

      // Insert all daily summaries
      for (const summary of dailySummaries) {
        await prisma.dailySummary.create({ data: summary });
      }

      // Call the week endpoint
      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${TEST_DEVICE_ID}/readings?period=week`,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);

      // Should get weekly summaries (not 35 daily ones)
      // 35 days can span 5-6 weeks depending on start day of week
      // Each week should have ~700 Wh (7 days * 100 Wh)
      expect(json.data).toBeDefined();
      expect(json.data.length).toBeLessThanOrEqual(6); // At most 6 weeks (if spanning partial weeks)
      expect(json.data.length).toBeGreaterThan(0); // At least 1 week

      // Total energy should be 35 * 100 = 3500 Wh
      expect(json.summary.totalEnergy).toBeCloseTo(3.5, 1); // 3.5 kWh

      // Check that each data point has realistic weekly energy
      json.data.forEach((point: any) => {
        // Each week should have energy (not individual days)
        expect(point.energy).toBeGreaterThan(0);
        expect(point.power).toBeGreaterThan(0);
      });
    });

    it('should handle partial weeks correctly', async () => {
      // Clean up first
      await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });

      // Create only 10 days of data (1 full week + 3 days)
      const now = new Date();
      for (let i = 0; i < 10; i++) {
        const date = new Date(now.getTime() - (9 - i) * 24 * 60 * 60 * 1000);
        date.setUTCHours(0, 0, 0, 0);

        await prisma.dailySummary.create({
          data: {
            deviceId: TEST_DEVICE_ID,
            date,
            avgPower: 10,
            maxPower: 20,
            minPower: 0,
            energyKwh: 0.1,
          },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${TEST_DEVICE_ID}/readings?period=week`,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);

      // Should still aggregate by week, even if weeks are partial
      expect(json.data.length).toBeGreaterThan(0);
      expect(json.summary.totalEnergy).toBeCloseTo(1.0, 1); // 10 days * 0.1 kWh
    });
  });

  describe('Month Period - Aggregates 90 days into ~13 weeks', () => {
    it('should group 90 daily summaries into weekly summaries', async () => {
      // Clean up first
      await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });

      // Create 90 days of daily summaries
      const now = new Date();
      for (let i = 0; i < 90; i++) {
        const date = new Date(now.getTime() - (89 - i) * 24 * 60 * 60 * 1000);
        date.setUTCHours(0, 0, 0, 0);

        await prisma.dailySummary.create({
          data: {
            deviceId: TEST_DEVICE_ID,
            date,
            avgPower: 10,
            maxPower: 20,
            minPower: 0,
            energyKwh: 0.1, // 100 Wh per day
          },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${TEST_DEVICE_ID}/readings?period=month`,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);

      // Should get weekly summaries (~13 weeks in 90 days)
      expect(json.data).toBeDefined();
      expect(json.data.length).toBeLessThanOrEqual(14); // ~13 weeks
      expect(json.data.length).toBeGreaterThan(10); // At least 10 weeks

      // Total energy should be 90 * 100 = 9000 Wh = 9 kWh
      expect(json.summary.totalEnergy).toBeCloseTo(9.0, 1);

      // Each week should have ~700 Wh (7 days * 100 Wh)
      json.data.forEach((point: any) => {
        expect(point.energy).toBeGreaterThan(0);
        expect(point.energy).toBeLessThan(1); // Less than 1 kWh per week
      });
    });
  });

  describe('Energy Totals Match - Critical Bug Fix', () => {
    it('week total should equal sum of all daily energies', async () => {
      // Clean up first
      await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });

      // Create 7 days with varying energy
      const now = new Date();
      const dailyEnergies = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]; // kWh
      let expectedTotal = 0;

      for (let i = 0; i < 7; i++) {
        const date = new Date(now.getTime() - (6 - i) * 24 * 60 * 60 * 1000);
        date.setUTCHours(0, 0, 0, 0);

        expectedTotal += dailyEnergies[i];

        await prisma.dailySummary.create({
          data: {
            deviceId: TEST_DEVICE_ID,
            date,
            avgPower: dailyEnergies[i] * 1000 / 24, // Calculate average power
            maxPower: 100,
            minPower: 0,
            energyKwh: dailyEnergies[i],
          },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${TEST_DEVICE_ID}/readings?period=week`,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);

      // CRITICAL: Total energy from week endpoint must match sum of daily energies
      // This was the user's bug report: "week total doesn't match actual total"
      expect(json.summary.totalEnergy).toBeCloseTo(expectedTotal, 2);
    });

    it('month total should equal sum of all daily energies', async () => {
      // Clean up first
      await prisma.dailySummary.deleteMany({ where: { deviceId: TEST_DEVICE_ID } });

      // Create 30 days with 0.1 kWh each
      const now = new Date();
      const expectedTotal = 30 * 0.1; // 3.0 kWh

      for (let i = 0; i < 30; i++) {
        const date = new Date(now.getTime() - (29 - i) * 24 * 60 * 60 * 1000);
        date.setUTCHours(0, 0, 0, 0);

        await prisma.dailySummary.create({
          data: {
            deviceId: TEST_DEVICE_ID,
            date,
            avgPower: 10,
            maxPower: 20,
            minPower: 0,
            energyKwh: 0.1,
          },
        });
      }

      const response = await app.inject({
        method: 'GET',
        url: `/api/devices/${TEST_DEVICE_ID}/readings?period=month`,
      });

      expect(response.statusCode).toBe(200);
      const json = JSON.parse(response.body);

      // CRITICAL: Total must match
      expect(json.summary.totalEnergy).toBeCloseTo(expectedTotal, 2);
    });
  });
});
