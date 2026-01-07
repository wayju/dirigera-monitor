import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock dotenv to prevent loading from .env file during tests
vi.mock('dotenv', () => ({
  default: { config: vi.fn() },
  config: vi.fn(),
}));

describe('config', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    vi.resetModules();
    // Create a clean environment for each test
    process.env = {};
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('should use default values when env vars not set', async () => {
    process.env.DIRIGERA_TOKEN = 'test-token';

    const { config } = await import('./config.js');

    expect(config.port).toBe(3001);
    expect(config.pollIntervalMinutes).toBe(5);
    expect(config.dirigera.hubIp).toBe('');
  });

  it('should parse PORT from environment', async () => {
    process.env.PORT = '4000';
    process.env.DIRIGERA_TOKEN = 'test-token';

    const { config } = await import('./config.js');

    expect(config.port).toBe(4000);
  });

  it('should parse POLL_INTERVAL_MINUTES from environment', async () => {
    process.env.POLL_INTERVAL_MINUTES = '10';
    process.env.DIRIGERA_TOKEN = 'test-token';

    const { config } = await import('./config.js');

    expect(config.pollIntervalMinutes).toBe(10);
  });

  describe('validateConfig', () => {
    it('should throw when DIRIGERA_HUB_IP is missing', async () => {
      process.env.DIRIGERA_TOKEN = 'valid-token';
      // No HUB_IP set
      const { validateConfig } = await import('./config.js');

      expect(() => validateConfig()).toThrow('DIRIGERA_HUB_IP environment variable is required');
    });

    it('should throw when DIRIGERA_TOKEN is missing', async () => {
      process.env.DIRIGERA_HUB_IP = '10.0.0.1';
      // No TOKEN set
      const { validateConfig } = await import('./config.js');

      expect(() => validateConfig()).toThrow('DIRIGERA_TOKEN environment variable is required');
    });

    it('should not throw when both DIRIGERA_HUB_IP and DIRIGERA_TOKEN are set', async () => {
      process.env.DIRIGERA_HUB_IP = '10.0.0.1';
      process.env.DIRIGERA_TOKEN = 'valid-token';

      const { validateConfig } = await import('./config.js');

      expect(() => validateConfig()).not.toThrow();
    });
  });
});
