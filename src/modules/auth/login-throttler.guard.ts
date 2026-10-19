import { Injectable } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';

// Counts login attempts per client IP and email (ADR 0012): guessing one
// account's password is slowed, without one noisy IP locking out every user.
@Injectable()
export class LoginThrottlerGuard extends ThrottlerGuard {
  protected override getTracker(req: Record<string, unknown>): Promise<string> {
    const body = req.body as { email?: unknown } | undefined;
    const email =
      typeof body?.email === 'string' ? body.email.trim().toLowerCase() : '';
    return Promise.resolve(`${String(req.ip)}:${email}`);
  }
}
