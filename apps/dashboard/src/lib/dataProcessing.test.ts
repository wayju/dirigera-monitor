import { describe, it, expect } from 'vitest';
import { ReadingData } from './api';

// Real data from server export - week view
const REAL_WEEK_DATA: ReadingData[] = [
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

describe('Data Processing - Week View', () => {
  describe('Raw data structure', () => {
    it('should have 5 data points', () => {
      expect(REAL_WEEK_DATA).toHaveLength(5);
    });

    it('should have all required fields', () => {
      REAL_WEEK_DATA.forEach((point, index) => {
        expect(point.timestamp).toBeDefined();
        expect(point.power).toBeDefined();
        expect(point.energy).toBeDefined();
        expect(typeof point.timestamp).toBe('string');
        expect(typeof point.power).toBe('number');
        expect(typeof point.energy).toBe('number');
      });
    });

    it('should not have null or NaN values', () => {
      REAL_WEEK_DATA.forEach(point => {
        expect(point.power).not.toBeNull();
        expect(point.energy).not.toBeNull();
        expect(Number.isNaN(point.power)).toBe(false);
        expect(Number.isNaN(point.energy)).toBe(false);
      });
    });

    it('should have non-negative power and energy values', () => {
      REAL_WEEK_DATA.forEach(point => {
        expect(point.power).toBeGreaterThanOrEqual(0);
        expect(point.energy).toBeGreaterThanOrEqual(0);
      });
    });
  });

  describe('Thursday Jan 2 data (near-zero power)', () => {
    const thursday = REAL_WEEK_DATA.find(d =>
      d.timestamp.startsWith('2026-01-02')
    )!;

    it('should exist', () => {
      expect(thursday).toBeDefined();
    });

    it('should have near-zero but non-zero power', () => {
      expect(thursday.power).toBeCloseTo(0.14, 2);
      expect(thursday.power).toBeGreaterThan(0);
      expect(thursday.power).toBeLessThan(1);
    });

    it('should have very small but non-zero energy', () => {
      expect(thursday.energy).toBeCloseTo(0.002, 3);
      expect(thursday.energy).toBeGreaterThan(0);
      expect(thursday.energy).toBeLessThan(0.01);
    });

    it('should not be treated as missing data', () => {
      expect(thursday.power).not.toBe(null);
      expect(thursday.power).not.toBe(undefined);
      expect(thursday.energy).not.toBe(null);
      expect(thursday.energy).not.toBe(undefined);
    });
  });

  describe('Friday Jan 3 data', () => {
    const friday = REAL_WEEK_DATA.find(d => d.timestamp.startsWith('2026-01-03'))!;

    it('should exist', () => {
      expect(friday).toBeDefined();
    });

    it('should have moderate power value', () => {
      expect(friday.power).toBeCloseTo(19.09, 2);
      expect(friday.power).toBeGreaterThan(1);
    });

    it('should have significant energy value', () => {
      expect(friday.energy).toBeCloseTo(0.458, 3);
      expect(friday.energy).toBeGreaterThan(0.1);
    });
  });

  describe('Date parsing and formatting', () => {
    it('should parse all timestamps correctly', () => {
      REAL_WEEK_DATA.forEach(point => {
        const date = new Date(point.timestamp);
        expect(date.toString()).not.toBe('Invalid Date');
        expect(date.getFullYear()).toBeGreaterThanOrEqual(2025);
      });
    });

    it('should identify days of week correctly', () => {
      const dates = REAL_WEEK_DATA.map(d => {
        const date = new Date(d.timestamp);
        return {
          iso: d.timestamp,
          dayOfWeek: date.toLocaleDateString('en-US', { weekday: 'short' }),
          date: date.toISOString().split('T')[0],
        };
      });

      // Find Thu and Fri
      const thu = dates.find(d => d.date === '2026-01-02');
      const fri = dates.find(d => d.date === '2026-01-03');

      expect(thu).toBeDefined();
      expect(fri).toBeDefined();

      // Note: The actual day of week depends on timezone
      // Jan 2, 2026 00:00 UTC is Thu in UTC, Wed evening in some zones
      expect(thu!.date).toBe('2026-01-02');
      expect(fri!.date).toBe('2026-01-03');
    });
  });

  describe('Frontend chart data transformation', () => {
    it('should convert power to display format', () => {
      const chartData = REAL_WEEK_DATA.map(d => ({
        timestamp: d.timestamp,
        power: d.power,
        powerDisplay: d.power < 1 ? d.power.toFixed(3) : d.power.toFixed(1),
      }));

      const thu = chartData.find(d => d.timestamp.startsWith('2026-01-02'))!;
      expect(thu.powerDisplay).toBe('0.142');

      const fri = chartData.find(d => d.timestamp.startsWith('2026-01-03'))!;
      expect(fri.powerDisplay).toBe('19.1');
    });

    it('should convert energy to kWh display format', () => {
      const chartData = REAL_WEEK_DATA.map(d => ({
        timestamp: d.timestamp,
        energy: d.energy,
        energyDisplay: d.energy.toFixed(3),
      }));

      const thu = chartData.find(d => d.timestamp.startsWith('2026-01-02'))!;
      expect(thu.energyDisplay).toBe('0.002');

      const fri = chartData.find(d => d.timestamp.startsWith('2026-01-03'))!;
      expect(fri.energyDisplay).toBe('0.458');
    });

    it('should not filter out near-zero values', () => {
      // Common bug: filtering out data with power < threshold
      const filtered = REAL_WEEK_DATA.filter(d => d.power > 1.0);
      const notFiltered = REAL_WEEK_DATA.filter(d => d.power >= 0);

      // All data should be kept
      expect(notFiltered).toHaveLength(5);

      // Thursday would be filtered if using > 1.0 threshold
      expect(filtered).toHaveLength(4); // All except Thursday have > 1W
    });

    it('should handle zero-check correctly', () => {
      REAL_WEEK_DATA.forEach(point => {
        // Both of these should be true for all data
        const isValidPower = point.power !== null && point.power !== undefined;
        const isValidEnergy = point.energy !== null && point.energy !== undefined;

        expect(isValidPower).toBe(true);
        expect(isValidEnergy).toBe(true);

        // Even near-zero should pass validity check
        expect(point.power >= 0).toBe(true);
        expect(point.energy >= 0).toBe(true);
      });
    });
  });

  describe('Chart bar rendering logic', () => {
    it('should determine bar visibility correctly', () => {
      const barData = REAL_WEEK_DATA.map(d => ({
        timestamp: d.timestamp,
        hasData: d.power !== null && d.energy !== null,
        showBar: d.energy > 0,
        barHeight: Math.max(d.energy, 0.0001), // Minimum visible height
      }));

      // All should have data and show bars
      barData.forEach(bar => {
        expect(bar.hasData).toBe(true);
        expect(bar.showBar).toBe(true);
        expect(bar.barHeight).toBeGreaterThan(0);
      });

      // Thursday should have a very small but visible bar
      const thu = barData.find(d => d.timestamp.startsWith('2026-01-02'))!;
      expect(thu.barHeight).toBeCloseTo(0.002, 3);
      expect(thu.showBar).toBe(true);
    });

    it('should apply minimum bar height for visibility', () => {
      const MIN_HEIGHT = 0.0001;

      const barData = REAL_WEEK_DATA.map(d => ({
        energy: d.energy,
        displayHeight: Math.max(d.energy, MIN_HEIGHT),
      }));

      // All bars should be visible
      barData.forEach(bar => {
        expect(bar.displayHeight).toBeGreaterThanOrEqual(MIN_HEIGHT);
      });

      // Thursday's actual value is above minimum
      const thu = barData.find((_, i) =>
        REAL_WEEK_DATA[i].timestamp.startsWith('2026-01-02')
      )!;
      expect(thu.energy).toBeCloseTo(0.002, 3);
      expect(thu.displayHeight).toBe(thu.energy); // Not clamped to minimum
    });
  });

  describe('Tooltip formatting', () => {
    it('should format tooltips correctly for all values', () => {
      const tooltips = REAL_WEEK_DATA.map(d => {
        const kWh = d.energy.toFixed(4);
        const watts = d.power.toFixed(3);
        return {
          timestamp: d.timestamp,
          display: `${kWh} kWh (${watts} W avg)`,
        };
      });

      const thu = tooltips.find(t => t.timestamp.startsWith('2026-01-02'))!;
      expect(thu.display).toBe('0.0020 kWh (0.142 W avg)');

      const fri = tooltips.find(t => t.timestamp.startsWith('2026-01-03'))!;
      expect(fri.display).toBe('0.4581 kWh (19.088 W avg)');
    });

    it('should not show "0.0000" for Thursday', () => {
      const thu = REAL_WEEK_DATA.find(d => d.timestamp.startsWith('2026-01-02'))!;

      const displayKwh = thu.energy.toFixed(4);
      expect(displayKwh).not.toBe('0.0000');
      expect(displayKwh).toBe('0.0020');
    });
  });
});
