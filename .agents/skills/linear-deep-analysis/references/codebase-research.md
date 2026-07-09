# Codebase Research

Project detection rules and path references for mapping Linear issues to code.

## Project Detection

Determine if the issue affects **Flexio**, **Portal**, or **both**.

See the project's `AGENTS.md` (or `CLAUDE.md` symlink) → **Project Detection Index** for keyword → project mapping. Common signals:

| Signal | Project |
|--------|---------|
| ERP modules (invoices, inventory, accounting, payroll) | Flexio |
| Client portal, solicitudes, approval workflows | Portal |
| API integration between Portal and ERP | Both |
| Login / auth for external users | Portal |
| Login / auth for internal users | Flexio |
| Reports, dashboards, document generation | Flexio |
| File upload from external clients | Portal |

## Path References — Flexio

| Layer | Path Pattern |
|-------|-------------|
| Legacy modules | `application/modules/<module>/` |
| DDD bounded contexts | `src/Flexio/<BoundedContext>/` |
| Symfony API | `apps/flexio/backend/` |
| Frontend Vue | `apps/flexio-vue*/` |

## Path References — Portal

| Layer | Path Pattern |
|-------|-------------|
| Backend Laravel controllers | `app/Http/Controllers/Api/` |
| Models | `app/Models/` |
| DDD layer | `src/Solicitudes/<BoundedContext>/` |
| Flexio integration | `src/Flexio/` (client calls) |
| Frontend React | `resources/apps/solicitudes-react/src/modules/` |

## Research Tools

| Tool | Best For |
|------|----------|
| `mcp__auggie-mcp__codebase-retrieval` | Architecture queries, understanding how systems connect |
| `mcp__auggie__augment_code_search` | Finding specific symbols, classes, functions |
| `Task(Explore)` | Comprehensive multi-file search when you need thorough coverage |
| `Grep` | Finding all usages of a known symbol or pattern |
| `Glob` | Discovering files by naming convention |

## Research Checklist

For each identified feature area, verify you've covered:

- [ ] Domain layer: Entities, Value Objects, Domain Events, Domain Services
- [ ] Application layer: Use Cases, Command / Query handlers, DTOs
- [ ] Infrastructure layer: Controllers, Repositories, DB tables / migrations, External integrations
- [ ] Frontend (if applicable): Components, state management, API calls
- [ ] Complete code path from entry point to database

## Flexio path conventions worth remembering

Many Flexio features have **dual implementations** — a modern DDD path under `src/Flexio/` and a legacy CodeIgniter path under `application/flexio/` or `application/modules/`. Always check both:

- Modern: `apps/flexio/backend/` → `src/Flexio/<BoundedContext>/`
- Legacy: `application/modules/<module>/` (controllers, models, views co-located)
- Bridge: any code in `application/flexio/` that exposes legacy logic to modern callers

When the issue describes a behavior, trace **the actual entry point** in use — many requests fail because the modern path was traced when production routes through the legacy one, or vice versa.

## Code path tracing — DDD signals

Useful signals when navigating a DDD codebase:

- Look for `AggregateRoot` / `AggregateBase` extension to identify aggregate boundaries
- `domain/`, `application/`, `infrastructure/` subdirectories under a bounded context indicate Hexagonal layout
- A `DomainEventBus` port + adapter pair signals async cross-aggregate communication
- An `EventSubscriber` directory under a bounded context exposes the subscriber-as-entry-point pattern — useful for tracing reactions to events emitted elsewhere

When the codebase practices DDD, the Code Path Trace should reflect aggregate boundaries explicitly; when it does not, the trace is a sequence of legacy controllers and repositories.
