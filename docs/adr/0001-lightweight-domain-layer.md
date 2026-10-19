# 0001. Business rules as pure functions in a small domain layer

## Decision
Both sets of rules live in `src/modules/applications/domain/` as plain TypeScript functions:
- `application-state-machine.ts`
- `application-access.policy.ts`

Nothing in `domain/` imports `@nestjs/*` or `typeorm`, and an ESLint `no-restricted-imports` rule fails lint if anything does. The services do the I/O (load, lock, save, enqueue) and call into these functions. Domain errors are plain classes that the global exception filter turns into HTTP status codes.

## Alternatives considered
- Rules written inline in the services. Faster to start with, but the checks end up spread across methods and can only be tested with mocked repositories.

## Consequences
The rules are unit tested in milliseconds without a database, and the whole lifecycle can be read in one file. The lint rule stops it drifting back into the services. The cost is one extra hop when reading a service method.
