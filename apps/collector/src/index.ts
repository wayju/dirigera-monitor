import Fastify from 'fastify';
import cors from '@fastify/cors';
import { PrismaClient } from '@prisma/client';
import { readFileSync, existsSync } from 'fs';
import { join } from 'path';
import { config, validateConfig } from './config.js';
import { DirigeraClient } from './dirigera-client.js';
import { startScheduler, collectReadings } from './scheduler.js';
import { registerDeviceRoutes } from './routes/devices.js';
import { registerSyncRoutes } from './routes/sync.js';
import { initTariff, getTariff } from './tariff.js';

// Try multiple paths for version.json (dev vs prod)
function loadVersion() {
  const paths = [
    join(__dirname, 'version.json'),
    join(process.cwd(), 'dist', 'version.json'),
    join(process.cwd(), 'src', 'version.json'),
  ];
  for (const p of paths) {
    if (existsSync(p)) {
      return JSON.parse(readFileSync(p, 'utf8'));
    }
  }
  return { version: '0.0.0', build: 0 };
}
const versionInfo = loadVersion();

const prisma = new PrismaClient();

async function main() {
  validateConfig();

  const app = Fastify({
    logger: true,
  });

  await app.register(cors, {
    origin: true,
  });

  const dirigeraClient = new DirigeraClient(config.dirigera.hubIp, config.dirigera.token);

  // Health check
  app.get('/health', async () => {
    try {
      const hubStatus = await dirigeraClient.getHubStatus();
      return {
        status: 'ok',
        hub: hubStatus,
        database: 'connected',
      };
    } catch (error) {
      return {
        status: 'degraded',
        hub: 'unreachable',
        database: 'connected',
      };
    }
  });

  // Register routes
  registerDeviceRoutes(app, prisma, dirigeraClient);
  registerSyncRoutes(app, prisma);

  // Tariff endpoint
  app.get('/api/tariff', async () => {
    return getTariff();
  });

  // Version endpoint
  app.get('/api/version', async () => {
    return versionInfo;
  });

  // Initialize tariff on startup
  try {
    const tariff = await initTariff();
    console.log(`Electricity tariff initialized: ${tariff.ratePerKwh} cents/kWh`);
  } catch (error) {
    console.error('Failed to initialize tariff:', error);
  }

  // Initial data collection
  try {
    const count = await collectReadings(dirigeraClient);
    console.log(`Initial collection: ${count} readings saved`);
  } catch (error) {
    console.error('Initial collection failed:', error);
  }

  // Start scheduler
  startScheduler(dirigeraClient);

  // Start server
  await app.listen({ port: config.port, host: '0.0.0.0' });
  console.log(`Server running on port ${config.port}`);
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
