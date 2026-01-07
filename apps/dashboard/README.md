# DIRIGERA Dashboard

Next.js dashboard for visualizing IKEA smart plug power consumption.

## Features

- Real-time device status cards
- Power consumption charts (Recharts)
- Period selector (hour, day, week, month, 6 months)
- Responsive design with Tailwind CSS

## Development

```bash
# Install dependencies
pnpm install

# Start dev server
pnpm dev
```

## Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `NEXT_PUBLIC_API_URL` | Collector API URL | http://localhost:3001 |

## Testing

```bash
pnpm test          # Run tests
pnpm test:coverage # Run with coverage
```

## Build

```bash
pnpm build   # Build for production
pnpm start   # Start production server
```
