# 0002. Object-level authorization through query scoping (404 vs 403)

## Context
"SALES users may view and edit only the applications they created." Any bypass is an automatic fail. Fetching a row and then checking ownership works, but it's easy to forget on a new endpoint, and list totals still give away how many rows exist.

## Decision
There are three layers:
1. A global JWT guard, so every route is protected unless marked otherwise.
2. `@Roles()` on each route.
3. Object-level checks in the service.

For SALES, every application query includes `created_by_id = :currentUser`. That covers single reads and writes as well as list and count queries.

It's a 404 when the caller isn't allowed to know the application exists: SALES asking for someone else's application, or a REVIEWER asking for a DRAFT. It's a 403 when they can see it but can't do the action, for example a REVIEWER who isn't the assigned one.

Identity only ever comes from the JWT. The DTOs don't accept `createdById`, `assignedReviewerId` or `status`, and `forbidNonWhitelisted` rejects a request that sends them.

## Alternatives considered
- Fetch, then check and return 403. That confirms the id exists, and one forgotten check on a new endpoint is a bypass.
- Postgres row-level security. Strong, but it needs a per-request DB role or session variable, and that takes longer to build and test than the time-box allows.

## Consequences
To the caller, an application they can't see looks exactly like one that doesn't exist, and pagination totals stay correct. The cost is that every new query has to go through the scoping helper. The "authorization cannot be bypassed" e2e suite is there to catch one that doesn't.

Callers add their own conditions with `andWhere`, for example `app.id = :id` or `app.status = :status`. TypeORM joins where-conditions without parentheses by default, so a caller condition containing `OR` could widen the scope. `typeorm.config.ts` turns on `isolateWhereStatements`, which wraps every condition in its own parentheses. An e2e test adds an `OR` condition to a SALES user's scoped query and checks that no other user's application comes back; it fails if the setting is turned off.
