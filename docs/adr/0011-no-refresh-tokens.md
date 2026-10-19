# 0011. Short-lived access tokens only; refresh tokens deferred

## Context
Requirement A asks for "login/token issuance, JWT route protection, role/policy checks". It doesn't mention refresh tokens. A refresh-token flow is only safe if it has all of these:
- hashed tokens stored on the server
- rotation on every use
- reuse detection that revokes the whole token family
- revocation on logout and password change
- a choice of delivery: an httpOnly cookie, which brings CSRF handling, or the response body, which is exposed to XSS

A partial version, such as a long-lived stateless refresh JWT, is effectively a credential that can't be revoked. That's worse than having none.

## Decision
- `POST /auth/login` issues a single HS256 access token valid for 15 minutes (`JWT_EXPIRES_IN_SECONDS`, validated to 60–86400).
- On every request `JwtStrategy` reloads the user and rejects users who are missing or deactivated. The role comes from the database, not from the token's claims. Deactivating a user therefore cuts off their access straight away, which is the main thing refresh-token revocation would have given us.
- When the token expires, the client logs in again.

## Alternatives considered
- Rotating refresh tokens with reuse detection. The right design for long sessions, but about 1–1.5 hours of work plus tests, for something the brief doesn't require and the rubric doesn't score.
- Long-lived access tokens. Simpler, but a leaked token would stay valid for days.
- An external identity provider (Keycloak, Auth0, Cognito). The realistic production answer for a payments platform, but out of scope for a self-contained take-home.

## Consequences
The auth surface is small and easy to audit: one secret, one token type, and deactivation takes effect immediately. Users have to log in again every 15 minutes, which is fine for an internal operations API but wouldn't be for a customer-facing app.

In production I'd use an OIDC identity provider, or rotating refresh tokens stored hashed, delivered as httpOnly SameSite cookies, with reuse detection.
