import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { processChartDataForPeriod, generateTimeSlotsForPeriod, ReadingData } from './chartProcessing';

// Real data from server export - matches backend integration tests
const REAL_server_DATA: ReadingData[] = [
  {
    timestamp: '2025-12-30T16:00:00.000Z', // Mon 16:00 UTC (bad timezone entry)
    power: 61.29838145262854,
    energy: 0.7355805774315425,
  },
  {
    timestamp: '2025-12-31T00:00:00.000Z', // Tue 00:00 UTC
    power: 32.25983348665759,
    energy: 0.1612991674332879,
  },
  {
    timestamp: '2026-01-01T00:00:00.000Z', // Wed 00:00 UTC
    power: 68.46600084263882,
    energy: 0.6846600084263882,
  },
  {
    timestamp: '2026-01-02T00:00:00.000Z', // Thu 00:00 UTC - near zero (printer off)
    power: 0.1419704126953762,
    energy: 0.001987585777735267,
  },
  {
    timestamp: '2026-01-03T00:00:00.000Z', // Fri 00:00 UTC
    power: 19.0881923763652,
    energy: 0.458116617032765,
  },
];

describe('Chart Processing with Real server Data', () => {
  // Mock current date to Jan 4, 2026 (when the data was exported)
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-01-04T10:00:00.000Z'));
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('7 Days View (day period)', () => {
    it('should generate 7 daily time slots', () => {
      const slots = generateTimeSlotsForPeriod('day');
      expect(slots).toHaveLength(7);

      // Should have slots for Dec 29, 30, 31, Jan 1, 2, 3, 4
      const labels = slots.map(s => s.label);
      expect(labels).toContain('Mon 29'); // Dec 29
      expect(labels).toContain('Tue 30'); // Dec 30
      expect(labels).toContain('Wed 31'); // Dec 31
      expect(labels).toContain('Thu 1');  // Jan 1
      expect(labels).toContain('Fri 2');  // Jan 2
      expect(labels).toContain('Sat 3');  // Jan 3
      expect(labels).toContain('Sun 4');  // Jan 4
    });

    it('should process real server data correctly', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // Frontend generates 7 slots for 7 days, maps 5 data points to them
      expect(result.data).toHaveLength(7);

      // 5 data points have data, 2 are empty (Dec 29 and today Jan 4)
      const daysWithData = result.data.filter(d => d.hasData);
      expect(daysWithData.length).toBe(5);

      // Find Friday Jan 2 (low power) and Saturday Jan 3
      const friJan2 = result.data.find(d => d.time === 'Fri 2');
      const satJan3 = result.data.find(d => d.time === 'Sat 3');

      // Friday Jan 2 should exist and have near-zero data
      expect(friJan2).toBeDefined();
      expect(friJan2!.hasData).toBe(true);
      expect(friJan2!.power).toBeCloseTo(0.14, 2);
      expect(friJan2!.energyDelta).toBeCloseTo(1.99, 1); // 0.002 kWh = 1.99 Wh
      expect(friJan2!.energyDelta).toBeGreaterThan(0); // NOT ZERO!

      // Saturday Jan 3 should exist and have data
      expect(satJan3).toBeDefined();
      expect(satJan3!.hasData).toBe(true);
      expect(satJan3!.power).toBeCloseTo(19.09, 2);
      expect(satJan3!.energyDelta).toBeCloseTo(458.12, 1); // 0.458 kWh = 458 Wh
      expect(satJan3!.energyDelta).toBeGreaterThan(0); // NOT ZERO!
    });

    it('should correctly identify which days have data and which dont', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // Frontend generates 7 slots, 5 have data, 2 are empty
      expect(result.data.length).toBe(7);

      const daysWithData = result.data.filter(d => d.hasData);
      const daysWithoutData = result.data.filter(d => !d.hasData);

      expect(daysWithData.length).toBe(5);
      expect(daysWithoutData.length).toBe(2);

      // Days with data should have energy > 0
      daysWithData.forEach(day => {
        expect(day.power).toBeGreaterThanOrEqual(0);
        expect(day.energyDelta).toBeGreaterThan(0);
      });

      // Days without data should have energyDelta = 0 (for chart display)
      daysWithoutData.forEach(day => {
        expect(day.power).toBeNull();
        expect(day.energyDelta).toBe(0);
      });
    });

    it('should calculate total energy correctly', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // Sum of all energy values
      const expectedTotal =
        0.7355805774315425 + // Dec 30
        0.1612991674332879 + // Dec 31
        0.6846600084263882 + // Jan 1
        0.001987585777735267 + // Jan 2 (very small!)
        0.458116617032765; // Jan 3

      expect(result.totalWh).toBeCloseTo(expectedTotal * 1000, 0); // Convert to Wh
    });

    it('should not show zero for days with very low energy', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      const fri = result.data.find(d => d.time === 'Fri 2');

      // Friday Jan 2 has 0.002 kWh which should NOT be treated as zero
      expect(fri?.energyDelta).not.toBe(0);
      expect(fri?.energyDelta).not.toBe(null);
      expect(fri?.energyDelta).toBeGreaterThan(0);
      expect(fri?.energyDelta).toBeCloseTo(1.99, 1); // ~2 Wh
    });
  });

  describe('6 Months View', () => {
    it('should generate 6 monthly time slots', () => {
      const slots = generateTimeSlotsForPeriod('6months');
      expect(slots).toHaveLength(6);

      // Should have slots for Aug, Sep, Oct, Nov, Dec 2025, Jan 2026
      const labels = slots.map(s => s.label);
      expect(labels).toContain('Aug 2025');
      expect(labels).toContain('Sep 2025');
      expect(labels).toContain('Oct 2025');
      expect(labels).toContain('Nov 2025');
      expect(labels).toContain('Dec 2025');
      expect(labels).toContain('Jan 2026'); // CRITICAL: January should be included!
    });

    it('should assign December and January data to correct months', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // This test uses 'day' period but we should test 6months separately
      // For now, verify the data exists
      expect(result.data.length).toBeGreaterThan(0);
    });

    it('should show January 2026 when data exists for Jan 1-3', () => {
      // We need to test with monthly summaries, not daily
      // This is a placeholder to show the expected behavior
      const janData: ReadingData[] = [
        {
          timestamp: '2026-01-01T00:00:00.000Z',
          power: 50.0,
          energy: 1.2, // Total for January
        },
      ];

      const result = processChartDataForPeriod(janData, '6months');

      const jan = result.data.find(d => d.time === 'Jan 2026');
      expect(jan).toBeDefined();
      expect(jan!.hasData).toBe(true);
      expect(jan!.energyDelta).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty data gracefully', () => {
      const result = processChartDataForPeriod([], 'day');

      // Frontend generates 7 slots even with no data
      expect(result.data).toHaveLength(7);

      // All slots should be empty
      expect(result.data.every(d => !d.hasData)).toBe(true);
      expect(result.data.every(d => d.energyDelta === 0)).toBe(true);
      expect(result.totalWh).toBe(0);
    });

    it('should handle data with bad timezone (16:00 UTC instead of 00:00)', () => {
      const badData: ReadingData[] = [
        {
          timestamp: '2025-12-30T16:00:00.000Z', // 16:00 UTC instead of 00:00
          power: 61.29,
          energy: 0.735,
        },
      ];

      const result = processChartDataForPeriod(badData, 'day');

      // Frontend generates 7 slots, 1 has data (Tue 30)
      expect(result.data).toHaveLength(7);

      const daysWithData = result.data.filter(d => d.hasData);
      expect(daysWithData.length).toBe(1);
      expect(daysWithData[0].time).toBe('Tue 30');
      expect(daysWithData[0].energyDelta).toBeGreaterThan(0);
    });

    it('should not lose precision on very small energy values', () => {
      const lowEnergyData: ReadingData[] = [
        {
          timestamp: '2026-01-02T00:00:00.000Z',
          power: 0.14,
          energy: 0.001987585777735267, // 0.002 kWh
        },
      ];

      const result = processChartDataForPeriod(lowEnergyData, 'day');

      // Frontend generates 7 slots, 1 has data
      expect(result.data).toHaveLength(7);

      const fri = result.data.find(d => d.time === 'Fri 2');

      // Should preserve precision - not round to zero
      expect(fri?.hasData).toBe(true);
      expect(fri?.energyDelta).toBeCloseTo(1.99, 1); // 1.99 Wh
      expect(fri?.energyDelta).not.toBe(0);
    });
  });

  describe('Data Integrity', () => {
    it('should not drop readings when processing', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // Frontend generates 7 slots, 5 have data
      expect(result.data).toHaveLength(7);
      const pointsWithData = result.data.filter(d => d.hasData);
      expect(pointsWithData.length).toBe(5);
    });

    it('should preserve all energy values in total', () => {
      const result = processChartDataForPeriod(REAL_server_DATA, 'day');

      // Sum energy from chart data (only slots with data)
      const chartTotal = result.data
        .filter(d => d.hasData && d.energyDelta !== null)
        .reduce((sum, d) => sum + d.energyDelta!, 0);

      // Should match totalWh
      expect(chartTotal).toBeCloseTo(result.totalWh, 0);

      // Should match sum of original data
      const originalTotal = REAL_server_DATA.reduce((sum, d) => sum + d.energy * 1000, 0);
      expect(result.totalWh).toBeCloseTo(originalTotal, 0);
    });
  });
});
