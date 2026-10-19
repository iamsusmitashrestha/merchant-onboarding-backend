# 0007. Feature modules under `src/modules/`, with one-way dependencies

## Context
The brief asks for a modular architecture. Every feature was already a Nest `@Module` with explicit exports, but the Nest CLI's default flat layout (`src/auth/`, `src/users/`) puts feature modules right next to shared infrastructure (`common/`, `config/`, `database/`), so the boundary isn't visible. That's how a dependency in the wrong direction went unnoticed: `common/` imported `Role` from `users/`.

## Decision
- Feature modules live in `src/modules/<feature>/`: auth, users, health, applications, risk and audit. Each one owns its controller, service, entities and DTOs, and exposes only what other modules need through `exports`.
- `src/common/` (errors, exception filter, redaction) and `src/config/` don't know about any feature.
- Dependency rules:
  - `modules/` may import `common/` and `config/`.
  - `common/` and `config/` may not import `modules/`. An ESLint `no-restricted-imports` rule enforces this.
  - A feature may use another feature's exported services and types, but never its repository.
  - `app.module.ts` and `database/` (entity registry, migrations, seeds) are composition roots, so they may reference every module.
- The auth decorators (`@Public`, `@Roles`, `@CurrentUser`) moved from `common/` into `modules/auth/`, because they belong to auth. `HealthController` got its own `HealthModule`.

## Alternatives considered
- Keep the CLI's flat layout. It's idiomatic Nest, but it doesn't separate features from shared code, which is exactly how the bad import got in.
- Separate packages or an Nx monorepo. Hard boundaries, but far too heavy for one service.

## Consequences
The boundaries are visible in the folder tree and checked by lint, so they don't rely on anyone remembering a convention. Import paths are a little longer.
