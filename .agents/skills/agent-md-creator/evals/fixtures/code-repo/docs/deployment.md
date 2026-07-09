# Deployment Guide

## Environments
- **Development**: Local with SQLite via Drizzle
- **Staging**: Fly.io with Postgres
- **Production**: Fly.io with Postgres + read replicas

## Deploy Commands
```bash
fly deploy --app task-api-staging  # Staging
fly deploy --app task-api          # Production
```

## Environment Variables
- `DATABASE_URL`: Postgres connection string
- `JWT_SECRET`: Secret for token signing
- `NODE_ENV`: development | staging | production
