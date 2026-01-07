import { describe, it, expect, vi, beforeEach } from 'vitest';

describe('api', () => {
  beforeEach(() => {
    vi.resetModules();
    global.fetch = vi.fn();
  });

  describe('fetchDevices', () => {
    it('should fetch devices from API', async () => {
      const mockDevices = [
        { id: '1', name: 'Plug 1', dirigeraId: 'd1', room: 'Living Room' },
      ];

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockDevices),
      });

      const { fetchDevices } = await import('./api');
      const devices = await fetchDevices();

      expect(devices).toEqual(mockDevices);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/api/devices'),
        expect.any(Object)
      );
    });

    it('should throw on API error', async () => {
      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: false,
        status: 500,
      });

      const { fetchDevices } = await import('./api');

      await expect(fetchDevices()).rejects.toThrow('Failed to fetch devices');
    });
  });

  describe('fetchCurrentReading', () => {
    it('should fetch current reading for a device', async () => {
      const mockReading = {
        device: { id: '1', name: 'Plug 1' },
        current: { powerWatts: 45.5, isOn: true },
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockReading),
      });

      const { fetchCurrentReading } = await import('./api');
      const reading = await fetchCurrentReading('1');

      expect(reading).toEqual(mockReading);
    });
  });

  describe('fetchReadings', () => {
    it('should fetch readings with period parameter', async () => {
      const mockReadings = {
        device: { id: '1', name: 'Plug 1' },
        period: 'day',
        data: [],
        summary: {},
      };

      (global.fetch as ReturnType<typeof vi.fn>).mockResolvedValue({
        ok: true,
        json: () => Promise.resolve(mockReadings),
      });

      const { fetchReadings } = await import('./api');
      const readings = await fetchReadings('1', 'day');

      expect(readings).toEqual(mockReadings);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('period=day'),
        expect.any(Object)
      );
    });
  });
});
