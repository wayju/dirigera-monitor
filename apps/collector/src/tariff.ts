// Electricity tariff scraper for SP Group Singapore

const TARIFF_URL = 'https://www.spgroup.com.sg/our-services/utilities/tariff-information';
const CACHE_FILE = '/tmp/electricity-tariff-cache.json';

export interface TariffInfo {
  ratePerKwh: number; // In cents
  currency: string;
  scrapedAt: string; // ISO date
  validFrom?: string;
  validTo?: string;
  source: string;
}

let cachedTariff: TariffInfo | null = null;

// Try to load from cache file on startup
async function loadFromCache(): Promise<TariffInfo | null> {
  try {
    const fs = await import('fs/promises');
    const data = await fs.readFile(CACHE_FILE, 'utf-8');
    return JSON.parse(data);
  } catch {
    return null;
  }
}

// Save to cache file
async function saveToCache(tariff: TariffInfo): Promise<void> {
  try {
    const fs = await import('fs/promises');
    await fs.writeFile(CACHE_FILE, JSON.stringify(tariff, null, 2));
  } catch (error) {
    console.error('Failed to save tariff cache:', error);
  }
}

// Scrape tariff from SP Group website
export async function scrapeTariff(): Promise<TariffInfo> {
  try {
    console.log('Scraping electricity tariff from SP Group...');

    const response = await fetch(TARIFF_URL);
    const html = await response.text();

    // Look for the tariff rate pattern - typically "XX.XX cents/kWh"
    // The rate with GST is what consumers pay
    const patterns = [
      /(\d+\.\d+)\s*cents?\s*\/?\s*kWh/gi,
      /tariff[^0-9]*(\d+\.\d+)/gi,
      /(\d+\.\d+)\s*c\/kWh/gi,
    ];

    let rate: number | null = null;

    for (const pattern of patterns) {
      const matches = html.matchAll(pattern);
      for (const match of matches) {
        const value = parseFloat(match[1]);
        // Reasonable tariff range for Singapore (15-50 cents/kWh)
        if (value >= 15 && value <= 50) {
          rate = value;
          break;
        }
      }
      if (rate) break;
    }

    // Fallback to known Q1 2026 rate if scraping fails
    if (!rate) {
      console.warn('Could not parse tariff from page, using fallback rate');
      rate = 29.11; // Q1 2026 rate with GST
    }

    const tariff: TariffInfo = {
      ratePerKwh: rate,
      currency: 'SGD',
      scrapedAt: new Date().toISOString(),
      source: TARIFF_URL,
    };

    cachedTariff = tariff;
    await saveToCache(tariff);

    console.log(`Electricity tariff: ${rate} cents/kWh`);
    return tariff;
  } catch (error) {
    console.error('Failed to scrape tariff:', error);

    // Return cached or fallback
    if (cachedTariff) {
      return cachedTariff;
    }

    const fallback: TariffInfo = {
      ratePerKwh: 29.11,
      currency: 'SGD',
      scrapedAt: new Date().toISOString(),
      source: 'fallback',
    };

    cachedTariff = fallback;
    return fallback;
  }
}

// Get current tariff (from cache or scrape)
export async function getTariff(): Promise<TariffInfo> {
  if (cachedTariff) {
    return cachedTariff;
  }

  // Try loading from file cache first
  const fileCached = await loadFromCache();
  if (fileCached) {
    cachedTariff = fileCached;
    return fileCached;
  }

  // Scrape fresh
  return scrapeTariff();
}

// Initialize tariff on startup
export async function initTariff(): Promise<TariffInfo> {
  const cached = await loadFromCache();

  if (cached) {
    const scrapedDate = new Date(cached.scrapedAt);
    const daysSinceScraped = (Date.now() - scrapedDate.getTime()) / (1000 * 60 * 60 * 24);

    // If cache is less than 1 day old, use it
    if (daysSinceScraped < 1) {
      console.log(`Using cached tariff: ${cached.ratePerKwh} cents/kWh (scraped ${daysSinceScraped.toFixed(1)} days ago)`);
      cachedTariff = cached;
      return cached;
    }
  }

  // Scrape fresh tariff
  return scrapeTariff();
}
