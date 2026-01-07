# Contributing to DIRIGERA Power Monitor

Thank you for your interest in contributing! This document provides guidelines for contributing to the project.

## Getting Started

1. Fork the repository
2. Clone your fork: `git clone https://github.com/YOUR_USERNAME/dirigera-dashboard.git`
3. Install dependencies: `pnpm install`
4. Create a feature branch: `git checkout -b feature/your-feature-name`

## Development Setup

### Prerequisites

- Node.js 20+
- pnpm
- Docker (optional, for running containers)

### Running Locally

```bash
# Install dependencies
pnpm install

# Start development servers
pnpm dev
```

The collector runs on port 3001 and dashboard on port 3000.

### Environment Variables

Copy `.env.example` to `.env` and configure:

```env
DIRIGERA_HUB_IP=<your-hub-ip>
DIRIGERA_TOKEN=<your-token>
```

## Code Style

- Use TypeScript for all new code
- Follow existing code patterns and conventions
- Use meaningful variable and function names
- Add comments for complex logic

## Testing

All PRs should include tests where applicable.

```bash
# Run tests
pnpm test

# Run with coverage
pnpm test:coverage

# Type checking
pnpm typecheck
```

### Pre-commit Hooks

The repository has pre-commit hooks that run:

1. TypeScript compilation check
2. Unit tests with coverage threshold
3. Security audit

Make sure all checks pass before submitting a PR.

## Pull Request Process

1. Ensure your code passes all tests and type checks
2. Update documentation if needed
3. Write a clear PR description explaining your changes
4. Link any related issues

## Reporting Issues

When reporting issues, please include:

- Description of the problem
- Steps to reproduce
- Expected vs actual behavior
- Your environment (OS, Node version, Docker version)
- Relevant logs or screenshots

## Feature Requests

Feature requests are welcome! Please open an issue describing:

- The problem you're trying to solve
- Your proposed solution
- Any alternatives you've considered

## Security

**Do not add authentication or expose the API to the internet.** This project is designed for secure internal network use only.

If you discover a security issue, please open an issue or contact the maintainers directly.

## License

By contributing, you agree that your contributions will be licensed under the MIT License.
