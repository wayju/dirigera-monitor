# DIRIGERA Collector

Fastify-based service that collects power consumption data from IKEA DIRIGERA smart plugs.

## Features

- Polls DIRIGERA hub every 5 minutes
- Stores readings in PostgreSQL
- Automatic hourly, daily, and monthly aggregation
- REST API for querying data

## Development

```bash
# Install dependencies
pnpm install

# Generate Prisma client
pnpm db:generate

# Run migrations
pnpm db:push

# Start dev server
pnpm dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `DATABASE_URL` | SQLite database path | file:../dirigera_monitor.db |
| `DIRIGERA_HUB_IP` | DIRIGERA hub IP address | **(required)** |
| `DIRIGERA_TOKEN` | OAuth access token | **(required)** |
| `POLL_INTERVAL_MINUTES` | Polling interval | 5 |
| `PORT` | Server port | 3001 |

## Testing

```bash
pnpm test          # Run tests
pnpm test:coverage # Run with coverage
```
