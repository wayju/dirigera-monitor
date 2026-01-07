import { describe, it, expect } from 'vitest';
import { format, subHours, startOfHour, addMinutes } from 'date-fns';

// Re-implement the functions here for testing (or export them from component)
const POLL_INTERVAL_MINUTES = 5;

interface ReadingData {
  timestamp: string;
  power: number;
  energy: number;
}

interface ChartDataPoint {
  timestamp: string;
  time: string;
  power: number | null;
  energyDelta: number | null;
  hasData: boolean;
}

function generateTimeSlots(hours: number): Date[] {
  const slots: Date[] = [];
  const now = new Date();
  const start = startOfHour(subHours(now, hours));

  let current = start;
  while (current <= now) {
    slots.push(new Date(current));
    current = addMinutes(current, POLL_INTERVAL_MINUTES);
  }
  return slots;
}

function processChartData(
  readings: ReadingData[],
  hours: number
): { data: ChartDataPoint[]; totalWh: number } {
  const slots = generateTimeSlots(hours);
  const SLOT_MS = POLL_INTERVAL_MINUTES * 60 * 1000;

  // Group readings into slots - for each slot, keep the latest reading
  const slotReadings = new Map<string, ReadingData>();

  for (const reading of readings) {
    const readingTime = new Date(reading.timestamp).getTime();
    const slotTime = Math.floor(readingTime / SLOT_MS) * SLOT_MS;
    const slotKey = new Date(slotTime).toISOString();

    const existing = slotReadings.get(slotKey);
    if (!existing || reading.timestamp > existing.timestamp) {
      slotReadings.set(slotKey, reading);
    }
  }

  // Find the reading just before our time window
  const windowStart = slots[0]?.getTime() || 0;
  let prevReading: ReadingData | null = null;

  for (const reading of readings) {
    const readingTime = new Date(reading.timestamp).getTime();
    if (readingTime < windowStart) {
      if (!prevReading || reading.timestamp > prevReading.timestamp) {
        prevReading = reading;
      }
    }
  }

  const result: ChartDataPoint[] = [];
  let totalWh = 0;

  for (const slot of slots) {
    const slotTime = Math.floor(slot.getTime() / SLOT_MS) * SLOT_MS;
    const slotKey = new Date(slotTime).toISOString();
    const reading = slotReadings.get(slotKey);

    let energyDelta: number | null = null;

    if (reading && prevReading) {
      const delta = reading.energy - prevReading.energy;
      energyDelta = delta >= 0 ? delta * 1000 : 0;
      totalWh += energyDelta;
    }

    if (reading) {
      prevReading = reading;
    }

    result.push({
      timestamp: slot.toISOString(),
      time: format(slot, 'HH:mm'),
      power: reading ? reading.power : null,
      energyDelta,
      hasData: !!reading,
    });
  }

  return { data: result, totalWh };
}

// Helper to calculate total energy correctly (as difference, not sum)
function calculateTotalEnergy(data: ReadingData[]): number {
  if (data.length < 2) return 0;
  const sorted = [...data].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  return sorted[sorted.length - 1].energy - sorted[0].energy;
}

describe('Energy Calculation', () => {
  it('should calculate totalEnergy as difference between first and last reading, not sum', () => {
    const readings: ReadingData[] = [
      { timestamp: '2026-01-01T03:00:00.000Z', power: 0.2, energy: 1.02 },
      { timestamp: '2026-01-01T03:05:00.000Z', power: 0.2, energy: 1.02 },
      { timestamp: '2026-01-01T03:10:00.000Z', power: 0.2, energy: 1.02 },
      { timestamp: '2026-01-01T03:15:00.000Z', power: 0.2, energy: 1.025 },
    ];

    const totalEnergy = calculateTotalEnergy(readings);

    // Should be 1.025 - 1.02 = 0.005, NOT 1.02 + 1.02 + 1.02 + 1.025 = 4.085
    expect(totalEnergy).toBeCloseTo(0.005, 3);
    expect(totalEnergy).not.toBeCloseTo(4.085, 1);
  });

  it('should return 0 for readings with no energy change', () => {
    const readings: ReadingData[] = [
      { timestamp: '2026-01-01T03:00:00.000Z', power: 0.1, energy: 1.02 },
      { timestamp: '2026-01-01T03:05:00.000Z', power: 0.1, energy: 1.02 },
      { timestamp: '2026-01-01T03:10:00.000Z', power: 0.1, energy: 1.02 },
    ];

    const totalEnergy = calculateTotalEnergy(readings);
    expect(totalEnergy).toBe(0);
  });

  it('should handle single reading', () => {
    const readings: ReadingData[] = [
      { timestamp: '2026-01-01T03:00:00.000Z', power: 0.2, energy: 1.02 },
    ];

    const totalEnergy = calculateTotalEnergy(readings);
    expect(totalEnergy).toBe(0);
  });
});

describe('Time Slot Matching', () => {
  it('should group readings into slots and use latest reading', () => {
    const now = new Date();
    const slotTime = startOfHour(subHours(now, 1));

    // Two readings in the same slot - should use the later one
    const readings: ReadingData[] = [
      {
        timestamp: addMinutes(slotTime, 1).toISOString(),
        power: 0.3,
        energy: 1.0,
      },
      {
        timestamp: addMinutes(slotTime, 2).toISOString(),
        power: 0.5,
        energy: 1.0,
      },
    ];

    const { data } = processChartData(readings, 1);
    const matchedSlot = data.find(
      (r) => r.timestamp === slotTime.toISOString()
    );

    expect(matchedSlot).toBeDefined();
    expect(matchedSlot?.hasData).toBe(true);
    expect(matchedSlot?.power).toBe(0.5); // Latest reading's power
  });

  it('should calculate energy deltas between consecutive matched readings', () => {
    const now = new Date();
    const slot1 = startOfHour(subHours(now, 1));
    const slot2 = addMinutes(slot1, 5);

    const readings: ReadingData[] = [
      { timestamp: slot1.toISOString(), power: 0.2, energy: 1.0 },
      { timestamp: slot2.toISOString(), power: 0.2, energy: 1.001 },
    ];

    const { data } = processChartData(readings, 1);

    const firstSlot = data.find((r) => r.timestamp === slot1.toISOString());
    const secondSlot = data.find((r) => r.timestamp === slot2.toISOString());

    // First reading has no previous, so energyDelta is null
    expect(firstSlot?.energyDelta).toBeNull();
    // Second reading: (1.001 - 1.0) * 1000 = 1 Wh
    expect(secondSlot?.energyDelta).toBeCloseTo(1, 1);
  });

  it('should return correct totalWh sum', () => {
    const now = new Date();
    const slot1 = startOfHour(subHours(now, 1));
    const slot2 = addMinutes(slot1, 5);
    const slot3 = addMinutes(slot1, 10);

    const readings: ReadingData[] = [
      { timestamp: slot1.toISOString(), power: 0.2, energy: 1.0 },
      { timestamp: slot2.toISOString(), power: 0.2, energy: 1.001 },
      { timestamp: slot3.toISOString(), power: 0.2, energy: 1.003 },
    ];

    const { totalWh } = processChartData(readings, 1);

    // (1.001 - 1.0) * 1000 + (1.003 - 1.001) * 1000 = 1 + 2 = 3 Wh
    expect(totalWh).toBeCloseTo(3, 1);
  });

  it('should show 0 energy delta when cumulative energy unchanged', () => {
    const now = new Date();
    const slot1 = startOfHour(subHours(now, 1));
    const slot2 = addMinutes(slot1, 5);

    const readings: ReadingData[] = [
      { timestamp: slot1.toISOString(), power: 0.1, energy: 1.02 },
      { timestamp: slot2.toISOString(), power: 0.1, energy: 1.02 },
    ];

    const { data } = processChartData(readings, 1);
    const secondSlot = data.find((r) => r.timestamp === slot2.toISOString());

    expect(secondSlot?.energyDelta).toBe(0);
  });

  it('should generate correct number of time slots for 6 hours', () => {
    const slots = generateTimeSlots(6);
    // 6 hours * 12 slots per hour = 72 slots minimum
    // Could be up to 84 (7 hours worth) depending on current time within hour
    expect(slots.length).toBeGreaterThanOrEqual(72);
    expect(slots.length).toBeLessThanOrEqual(85);
  });

  it('should fill gaps with null power and null energyDelta', () => {
    const now = new Date();
    const slot1 = startOfHour(subHours(now, 1));
    // Skip slot2 (5 min mark), provide data for slot3 (10 min mark)
    const slot3 = addMinutes(slot1, 10);

    const readings: ReadingData[] = [
      { timestamp: slot1.toISOString(), power: 0.2, energy: 1.0 },
      { timestamp: slot3.toISOString(), power: 0.3, energy: 1.002 },
    ];

    const { data } = processChartData(readings, 1);
    const gapSlot = data.find(
      (r) => r.timestamp === addMinutes(slot1, 5).toISOString()
    );

    expect(gapSlot?.hasData).toBe(false);
    expect(gapSlot?.power).toBeNull();
    expect(gapSlot?.energyDelta).toBeNull();
  });
});
