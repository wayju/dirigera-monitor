import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock fs/promises
vi.mock('fs/promises', () => ({
  readFile: vi.fn(),
  writeFile: vi.fn(),
}));

// Mock global fetch
const mockFetch = vi.fn();
global.fetch = mockFetch;

describe('tariff', () => {
  beforeEach(() => {
    vi.resetModules();
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('scrapeTariff', () => {
    it('should scrape tariff from webpage and return rate', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('The tariff rate is 29.11 cents/kWh for this quarter'),
      });

      const fs = await import('fs/promises');
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const { scrapeTariff } = await import('./tariff.js');
      const result = await scrapeTariff();

      expect(result.ratePerKwh).toBe(29.11);
      expect(result.currency).toBe('SGD');
      expect(result.source).toContain('spgroup.com.sg');
    });

    it('should use fallback rate when scraping fails', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const { scrapeTariff } = await import('./tariff.js');
      const result = await scrapeTariff();

      expect(result.ratePerKwh).toBe(29.11);
      expect(result.source).toBe('fallback');
    });

    it('should use fallback when rate not found in page', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('No rate information here'),
      });

      const fs = await import('fs/promises');
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const { scrapeTariff } = await import('./tariff.js');
      const result = await scrapeTariff();

      expect(result.ratePerKwh).toBe(29.11);
    });

    it('should match rate pattern with c/kWh format', async () => {
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('Current rate: 30.50 c/kWh'),
      });

      const fs = await import('fs/promises');
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(undefined);

      const { scrapeTariff } = await import('./tariff.js');
      const result = await scrapeTariff();

      expect(result.ratePerKwh).toBe(30.5);
    });
  });

  describe('getTariff', () => {
    it('should return cached tariff if available', async () => {
      // First scrape to cache
      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('Rate is 28.00 cents/kWh'),
      });

      const fs = await import('fs/promises');
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);
      (fs.readFile as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('No cache'));

      const { scrapeTariff, getTariff } = await import('./tariff.js');
      await scrapeTariff();

      // Second call should return cached
      const result = await getTariff();
      expect(result.ratePerKwh).toBe(28);
    });

    it('should load from file cache when memory cache empty', async () => {
      const fs = await import('fs/promises');
      const cachedTariff = {
        ratePerKwh: 27.5,
        currency: 'SGD',
        scrapedAt: new Date().toISOString(),
        source: 'cache',
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(cachedTariff));

      const { getTariff } = await import('./tariff.js');
      const result = await getTariff();

      expect(result.ratePerKwh).toBe(27.5);
    });
  });

  describe('initTariff', () => {
    it('should use fresh cache if less than 1 day old', async () => {
      const fs = await import('fs/promises');
      const recentTariff = {
        ratePerKwh: 26.0,
        currency: 'SGD',
        scrapedAt: new Date().toISOString(), // Now - should be fresh
        source: 'cached',
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(recentTariff));

      const { initTariff } = await import('./tariff.js');
      const result = await initTariff();

      expect(result.ratePerKwh).toBe(26.0);
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should scrape fresh when cache is old', async () => {
      const fs = await import('fs/promises');
      const oldDate = new Date();
      oldDate.setDate(oldDate.getDate() - 2); // 2 days ago
      const oldTariff = {
        ratePerKwh: 25.0,
        currency: 'SGD',
        scrapedAt: oldDate.toISOString(),
        source: 'cached',
      };
      (fs.readFile as ReturnType<typeof vi.fn>).mockResolvedValueOnce(JSON.stringify(oldTariff));

      mockFetch.mockResolvedValueOnce({
        text: () => Promise.resolve('New rate: 31.00 cents/kWh'),
      });
      (fs.writeFile as ReturnType<typeof vi.fn>).mockResolvedValue(undefined);

      const { initTariff } = await import('./tariff.js');
      const result = await initTariff();

      expect(result.ratePerKwh).toBe(31.0);
      expect(mockFetch).toHaveBeenCalled();
    });
  });
});
