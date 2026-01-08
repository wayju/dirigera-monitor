# DIRIGERA Power Monitor

Monitor power consumption from IKEA DIRIGERA smart plugs with a real-time dashboard.

## Disclaimer

**USE AT YOUR OWN RISK.** This software:

- Has **no authentication or security features** - it is intended for use on secure internal networks only
- Is **not affiliated with or endorsed by IKEA** - it may stop working at any time due to firmware updates or API changes
- Is provided "as is" without warranty of any kind
- Should not be exposed to the public internet

## Features

- Real-time power monitoring from IKEA INSPELNING smart plugs via DIRIGERA hub
- Historical data visualization (hour, day, week, month, 6 months)
- Automatic data aggregation (hourly, daily, monthly summaries)
- Landing page with top 3 consumers overview
- Full-screen kiosk mode for wall-mounted displays
- Docker-based deployment

## Architecture

```
┌─────────────────┐     ┌─────────────────┐     ┌─────────────────┐
│   DIRIGERA Hub  │────▶│  Collector Svc  │────▶│     SQLite      │
│   (Your Hub IP) │     │   (Fastify)     │     │                 │
└─────────────────┘     └─────────────────┘     └────────┬────────┘
                                                         │
                        ┌─────────────────┐              │
                        │    Dashboard    │◀─────────────┘
                        │   (Next.js)     │
                        └─────────────────┘
```

## Requirements

- IKEA DIRIGERA hub
- IKEA INSPELNING smart plugs (or other DIRIGERA-compatible power monitoring plugs)
- Docker and Docker Compose
- Node.js 20+ (for development)

## Quick Start

### 1. Get DIRIGERA Access Token

You need to obtain an access token from your DIRIGERA hub. Press the action button on your hub, then use the [dirigera](https://github.com/Leggin/dirigera) Python library or similar tool to authenticate:

```bash
pip install dirigera
dirigera generate-token --ip <YOUR_HUB_IP>
```

### 2. Configure Environment

```bash
cp .env.example .env
```

Edit `.env` with your settings:

```env
DIRIGERA_HUB_IP=<YOUR_HUB_IP>
DIRIGERA_TOKEN=<YOUR_TOKEN>
```

### 3. Start with Docker Compose

For local development:
```bash
docker compose up -d
```

For production deployment:
```bash
docker compose -f docker-compose.nas.yml up -d
```

Access:
- Dashboard: http://localhost:7353
- API: http://localhost:7352

## Configuration

### Environment Variables

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `DIRIGERA_HUB_IP` | Yes | - | IP address of your DIRIGERA hub |
| `DIRIGERA_TOKEN` | Yes | - | Access token for DIRIGERA API |
| `POLL_INTERVAL_MINUTES` | No | 5 | How often to poll for readings |
| `DATABASE_URL` | No | file:../dirigera_monitor.db | SQLite database path |
| `PORT` | No | 3001 | Collector API port |

### Dashboard Build Args

When building the dashboard, set `NEXT_PUBLIC_API_URL` to the URL where the collector API will be accessible:

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=http://your-server:7352 ./apps/dashboard
```

## Development

### Prerequisites

- Node.js 20+
- pnpm

### Setup

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

### Testing

```bash
# Run all tests
pnpm test

# Run with coverage
pnpm test:coverage

# Type checking
pnpm typecheck
```

## Project Structure

```
├── apps/
│   ├── collector/          # Fastify backend + data collector
│   │   ├── src/
│   │   │   ├── index.ts           # Main entry point
│   │   │   ├── config.ts          # Configuration
│   │   │   ├── dirigera-client.ts # DIRIGERA API client
│   │   │   ├── scheduler.ts       # Polling scheduler
│   │   │   ├── aggregation.ts     # Data aggregation jobs
│   │   │   └── routes/            # API routes
│   │   └── prisma/
│   │       └── schema.prisma      # Database schema
│   │
│   └── dashboard/          # Next.js frontend
│       └── src/
│           ├── app/               # Next.js app router
│           ├── components/        # React components
│           └── lib/               # Utilities
│
├── docker-compose.yml      # Development compose
├── docker-compose.nas.yml  # Production compose
└── .env.example            # Example environment file
```

## API Endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /health` | Health check with hub status |
| `GET /api/devices` | List all smart plugs |
| `GET /api/devices/:id/current` | Current reading from hub |
| `GET /api/devices/:id/readings?period=day` | Historical readings |
| `GET /api/tariff` | Current electricity tariff |

### Period Options

- `hour` - Last 60 minutes (5-minute intervals)
- `day` - Last 24 hours (hourly summaries)
- `week` - Last 7 days (daily summaries)
- `month` - Last 30 days (daily summaries)
- `6months` - Last 6 months (monthly summaries)

## Database

The application uses SQLite for simplicity and portability. Data is stored in:

- **devices** - Smart plug registry
- **readings** - Raw 5-minute readings
- **hourly_summaries** - Aggregated hourly data
- **daily_summaries** - Aggregated daily data
- **monthly_summaries** - Aggregated monthly data

## Contributing

See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines.

## License

MIT License - see [LICENSE](LICENSE) for details.

## Acknowledgments

- [IKEA](https://www.ikea.com) for the DIRIGERA smart home platform
- [dirigera](https://github.com/Leggin/dirigera) for reverse-engineering the DIRIGERA API
