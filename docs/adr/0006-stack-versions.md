# 0006. NestJS 11 (CommonJS) instead of NestJS 12

## Context
The brief says "NestJS 10+". The current major, NestJS 12 (12.1.x), is published ESM-only (`"type": "module"`). Jest, ts-jest and the TypeORM migration CLI (`typeorm-ts-node-commonjs`) are all noticeably more fragile under ESM, and I didn't want to spend the time-box debugging tooling.

## Decision
- NestJS 11 (11.2.x) on CommonJS. It's still maintained; the last release was on 2026-09-30.
- The Nest add-ons are pinned to the majors that go with Nest 11: `@nestjs/swagger@11`, `@nestjs/config@4`, `@nestjs/typeorm@11`, `@nestjs/jwt@11`, `@nestjs/passport@11`, `@nestjs/bullmq@11`, `nestjs-pino@4`.
- A scoped npm `overrides` entry lifts the `js-yaml` that `@nestjs/swagger` pins from 5.3.0 to 5.5.0. That fixes a moderate advisory without a major upgrade, and `npm audit --omit=dev` reports 0 vulnerabilities.
- `ioredis@5` is a direct dependency. BullMQ 6 no longer ships a Redis client; `ioredis` is an optional peer that it loads at runtime. Without it, build and lint pass and the app then fails on the first queue connection.
- `bcryptjs` (pure JS) instead of `bcrypt` (native), so the Alpine Docker image doesn't need a build toolchain.

## Alternatives considered
- NestJS 12 with ESM. Newest, but the tooling risk is real and this assignment gains nothing from it.
- `npm audit fix --force`. It pulls in `@nestjs/swagger@12` and breaks the peer dependencies.

## Consequences
Jest, ts-jest and the TypeORM CLI run on their standard CommonJS setup, which is the most widely used one. The downside is being one major behind: upgrading later means an ESM migration plus new majors for the add-ons. The `overrides` entry should be removed once `@nestjs/swagger@11` ships a fixed `js-yaml`.
