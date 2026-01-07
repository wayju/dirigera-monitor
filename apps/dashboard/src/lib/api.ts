// Runtime environment config (injected by env.sh at container startup)
// Falls back to build-time env var, then to localhost default
function getApiBase(): string {
  // Browser: check runtime config first
  if (typeof window !== 'undefined') {
    const runtimeUrl = (window as Window & { __ENV?: { API_URL?: string } }).__ENV?.API_URL;
    if (runtimeUrl) return runtimeUrl;
  }
  // Fallback to build-time env or default
  return process.env.NEXT_PUBLIC_API_URL || 'http://localhost:7352';
}

export const API_BASE = getApiBase();

export interface Device {
  id: string;
  dirigeraId: string;
  name: string;
  room: string | null;
  model: string | null;
  createdAt: string;
}

export interface CurrentReading {
  device: {
    id: string;
    name: string;
    room: string | null;
  };
  current: {
    isOn: boolean;
    powerWatts: number;
    voltage: number;
    currentAmps: number;
    energyKwh: number;
    isReachable: boolean;
  };
}

export interface ReadingData {
  timestamp: string;
  power: number;
  energy: number;
}

export interface ReadingsResponse {
  device: {
    id: string;
    name: string;
    room: string | null;
  };
  period: string;
  data: ReadingData[];
  summary: {
    avgPower: number;
    maxPower: number;
    minPower: number;
    totalEnergy: number;
  };
}

export type Period = 'hour' | 'day' | 'week' | 'month' | '6months';

export async function fetchDevices(): Promise<Device[]> {
  const res = await fetch(`${API_BASE}/api/devices`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch devices');
  return res.json();
}

export async function fetchCurrentReading(deviceId: string): Promise<CurrentReading> {
  const res = await fetch(`${API_BASE}/api/devices/${deviceId}/current`, {
    cache: 'no-store',
  });
  if (!res.ok) throw new Error('Failed to fetch current reading');
  return res.json();
}

export async function fetchReadings(
  deviceId: string,
  period: Period
): Promise<ReadingsResponse> {
  const res = await fetch(
    `${API_BASE}/api/devices/${deviceId}/readings?period=${period}`,
    { cache: 'no-store' }
  );
  if (!res.ok) throw new Error('Failed to fetch readings');
  return res.json();
}

export interface TariffInfo {
  ratePerKwh: number; // In cents
  currency: string;
  scrapedAt: string; // ISO date
  source: string;
}

export async function fetchTariff(): Promise<TariffInfo> {
  const res = await fetch(`${API_BASE}/api/tariff`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch tariff');
  return res.json();
}

export interface VersionInfo {
  version: string;
  build: number;
}

export async function fetchApiVersion(): Promise<VersionInfo> {
  const res = await fetch(`${API_BASE}/api/version`, { cache: 'no-store' });
  if (!res.ok) throw new Error('Failed to fetch API version');
  return res.json();
}
