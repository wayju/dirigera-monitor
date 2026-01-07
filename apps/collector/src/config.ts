import dotenv from 'dotenv';

dotenv.config();

export const config = {
  port: parseInt(process.env.PORT || '3001', 10),
  dirigera: {
    hubIp: process.env.DIRIGERA_HUB_IP || '',
    token: process.env.DIRIGERA_TOKEN || '',
  },
  pollIntervalMinutes: parseInt(process.env.POLL_INTERVAL_MINUTES || '5', 10),
  database: {
    url: process.env.DATABASE_URL || 'file:../dirigera_monitor.db',
  },
} as const;

export function validateConfig(): void {
  if (!config.dirigera.hubIp) {
    throw new Error('DIRIGERA_HUB_IP environment variable is required');
  }
  if (!config.dirigera.token) {
    throw new Error('DIRIGERA_TOKEN environment variable is required');
  }
}
