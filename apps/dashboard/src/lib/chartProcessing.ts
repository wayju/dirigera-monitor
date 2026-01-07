import { parseISO, addDays, addWeeks, addMinutes, format } from 'date-fns';

export type Period = 'hour' | 'day' | 'week' | 'month' | '6months';

export interface ReadingData {
  timestamp: string;
  power: number;
  energy: number;
}

export interface ChartDataPoint {
  timestamp: string;
  time: string;
  power: number | null;
  energyDelta: number | null;
  hasData: boolean;
}

interface TimeSlot {
  start: Date;
  end: Date;
  label: string;
}

const POLL_INTERVAL_MINUTES = 5;

// UTC-aware helper functions
function startOfDayUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCHours(0, 0, 0, 0);
  return d;
}

function startOfHourUTC(date: Date): Date {
  const d = new Date(date);
  d.setUTCMinutes(0, 0, 0);
  return d;
}

function subDaysUTC(date: Date, days: number): Date {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() - days);
  return d;
}

function subHoursUTC(date: Date, hours: number): Date {
  return new Date(date.getTime() - hours * 60 * 60 * 1000);
}

function startOfWeekUTC(date: Date, weekStartsOn: number = 1): Date {
  const d = startOfDayUTC(date);
  const day = d.getUTCDay();
  const diff = (day < weekStartsOn ? 7 : 0) + day - weekStartsOn;
  return new Date(d.getTime() - diff * 24 * 60 * 60 * 1000);
}

function subWeeksUTC(date: Date, weeks: number): Date {
  return new Date(date.getTime() - weeks * 7 * 24 * 60 * 60 * 1000);
}

// Generate time slots for different periods - ALL IN UTC
export function generateTimeSlotsForPeriod(period: Period): TimeSlot[] {
  const now = new Date();
  const slots: TimeSlot[] = [];

  switch (period) {
    case 'hour': {
      // 24 hours: 5-minute intervals (in UTC)
      const start = startOfHourUTC(subHoursUTC(now, 24));
      let current = start;
      while (current <= now) {
        const end = addMinutes(current, POLL_INTERVAL_MINUTES);
        slots.push({
          start: new Date(current),
          end: new Date(end),
          label: format(current, 'HH:mm'),
        });
        current = end;
      }
      break;
    }
    case 'day': {
      // 7 days: daily slots (in UTC)
      for (let i = 6; i >= 0; i--) {
        const dayStart = startOfDayUTC(subDaysUTC(now, i));
        const dayEnd = addDays(dayStart, 1);
        slots.push({
          start: dayStart,
          end: dayEnd,
          label: format(dayStart, 'EEE d'),
        });
      }
      break;
    }
    case 'week': {
      // 5 weeks: weekly slots (in UTC)
      for (let i = 4; i >= 0; i--) {
        const weekStart = startOfWeekUTC(subWeeksUTC(now, i), 1);
        const weekEnd = addWeeks(weekStart, 1);
        slots.push({
          start: weekStart,
          end: weekEnd,
          label: format(weekStart, 'MMM d'),
        });
      }
      break;
    }
    case 'month': {
      // 3 months: weekly slots (about 13 weeks) (in UTC)
      for (let i = 12; i >= 0; i--) {
        const weekStart = startOfWeekUTC(subWeeksUTC(now, i), 1);
        const weekEnd = addWeeks(weekStart, 1);
        slots.push({
          start: weekStart,
          end: weekEnd,
          label: format(weekStart, 'MMM d'),
        });
      }
      break;
    }
    case '6months': {
      // 6 months: monthly slots (in UTC)
      for (let i = 5; i >= 0; i--) {
        // Use UTC methods to create month boundaries
        const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1, 0, 0, 0, 0));
        const monthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i + 1, 1, 0, 0, 0, 0));
        slots.push({
          start: monthStart,
          end: monthEnd,
          label: format(monthStart, 'MMM yyyy'),
        });
      }
      break;
    }
    default: {
      // Default to hourly
      const start = startOfHourUTC(subHoursUTC(now, 6));
      let current = start;
      while (current <= now) {
        const end = addMinutes(current, POLL_INTERVAL_MINUTES);
        slots.push({
          start: new Date(current),
          end: new Date(end),
          label: format(current, 'HH:mm'),
        });
        current = end;
      }
    }
  }

  return slots;
}

// Process chart data for any period
// Generates time slots and maps backend data to them
export function processChartDataForPeriod(
  readings: ReadingData[],
  period: Period
): { data: ChartDataPoint[]; totalWh: number } {
  console.log(`[${period}] Processing ${readings.length} readings from backend`);

  // For hour period, just pass through the data (backend sends individual readings)
  // For other periods, generate slots and map data to them
  if (period === 'hour') {
    return processHourPeriod(readings);
  }

  // Generate time slots for the period
  const slots = generateTimeSlotsForPeriod(period);
  console.log(`[${period}] Generated ${slots.length} time slots`);

  // Create a map of readings by their slot
  const slotDataMap = new Map<string, { power: number; energy: number }>();

  for (const reading of readings) {
    const readingTime = parseISO(reading.timestamp);

    // Find which slot this reading belongs to
    for (const slot of slots) {
      if (readingTime >= slot.start && readingTime < slot.end) {
        const existing = slotDataMap.get(slot.label);
        if (existing) {
          // Sum energy, average power (shouldn't happen for aggregated data)
          existing.energy += reading.energy;
          existing.power = (existing.power + reading.power) / 2;
        } else {
          slotDataMap.set(slot.label, {
            power: reading.power,
            energy: reading.energy,
          });
        }
        break;
      }
    }
  }

  // Build result array with all slots (empty slots have null values)
  const result: ChartDataPoint[] = [];
  let totalWh = 0;

  for (const slot of slots) {
    const data = slotDataMap.get(slot.label);

    if (data) {
      const energyWh = data.energy * 1000; // Convert kWh to Wh
      totalWh += energyWh;

      result.push({
        timestamp: slot.start.toISOString(),
        time: slot.label,
        power: data.power,
        energyDelta: energyWh,
        hasData: true,
      });
    } else {
      // Empty slot - no data for this period
      result.push({
        timestamp: slot.start.toISOString(),
        time: slot.label,
        power: null,
        energyDelta: 0, // Show as zero, not null (so bar appears at 0)
        hasData: false,
      });
    }
  }

  console.log(`[${period}] Final chart data (${result.length} points)`);
  console.log(`[${period}] Total energy: ${totalWh.toFixed(2)}Wh (${(totalWh / 1000).toFixed(3)}kWh)`);

  return { data: result, totalWh };
}

// Special processing for hour period - generate all 24 hours of slots and map data
function processHourPeriod(readings: ReadingData[]): { data: ChartDataPoint[]; totalWh: number } {
  // Generate all time slots for 24 hours (5-minute intervals)
  const slots = generateTimeSlotsForPeriod('hour');
  console.log(`[hour] Generated ${slots.length} time slots`);

  // Round a timestamp to the nearest 5-minute interval (for matching)
  const roundTo5Min = (date: Date): string => {
    const d = new Date(date);
    d.setUTCMinutes(Math.floor(d.getUTCMinutes() / 5) * 5, 0, 0);
    return d.toISOString();
  };

  // Create a map of readings by their rounded timestamp
  const readingMap = new Map<string, { power: number; energy: number }>();
  for (const reading of readings) {
    const readingTime = parseISO(reading.timestamp);
    const key = roundTo5Min(readingTime);
    const existing = readingMap.get(key);
    if (existing) {
      // Sum energy, average power for same slot
      existing.energy += reading.energy;
      existing.power = (existing.power + reading.power) / 2;
    } else {
      readingMap.set(key, {
        power: reading.power,
        energy: reading.energy,
      });
    }
  }

  // Build result array with all slots
  const result: ChartDataPoint[] = [];
  let totalWh = 0;

  for (const slot of slots) {
    const key = slot.start.toISOString();
    const data = readingMap.get(key);

    if (data) {
      const energyWh = data.energy * 1000; // Convert kWh to Wh
      totalWh += energyWh;

      result.push({
        timestamp: slot.start.toISOString(),
        time: slot.label,
        power: data.power,
        energyDelta: energyWh,
        hasData: true,
      });
    } else {
      // Empty slot - no data for this period
      result.push({
        timestamp: slot.start.toISOString(),
        time: slot.label,
        power: null,
        energyDelta: 0, // Show as zero (so bar appears at 0 height)
        hasData: false,
      });
    }
  }

  console.log(`[hour] Final chart data (${result.length} points)`);
  console.log(`[hour] Total energy: ${totalWh.toFixed(2)}Wh (${(totalWh / 1000).toFixed(3)}kWh)`);

  return { data: result, totalWh };
}
