import { UserRole } from '../../modules/users/user-role.enum';

/** Fake demo users only (example.com). */
export const SEED_USERS = {
  admin: { email: 'admin@example.com', role: UserRole.ADMIN },
  reviewer: { email: 'reviewer@example.com', role: UserRole.REVIEWER },
  reviewer2: { email: 'reviewer2@example.com', role: UserRole.REVIEWER },
  sales: { email: 'sales@example.com', role: UserRole.SALES },
  sales2: { email: 'sales2@example.com', role: UserRole.SALES },
} as const;

export type SeedUserKey = keyof typeof SEED_USERS;
