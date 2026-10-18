import { hash } from 'bcryptjs';
import dataSource from '../data-source';
import { UserRole } from '../../modules/users/user-role.enum';
import { User } from '../../modules/users/user.entity';

/** Fake demo users only (example.com). Safe to run repeatedly: upserts by email. */
export const SEED_USERS: Array<{ email: string; role: UserRole }> = [
  { email: 'admin@example.com', role: UserRole.ADMIN },
  { email: 'reviewer@example.com', role: UserRole.REVIEWER },
  { email: 'reviewer2@example.com', role: UserRole.REVIEWER },
  { email: 'sales@example.com', role: UserRole.SALES },
  { email: 'sales2@example.com', role: UserRole.SALES },
];

async function seed(): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_USER_PASSWORD must be set (min 12 characters)');
  }

  await dataSource.initialize();
  try {
    const passwordHash = await hash(password, 12);
    await dataSource.getRepository(User).upsert(
      SEED_USERS.map((u) => ({ ...u, passwordHash, active: true })),
      ['email'],
    );
    console.log(`Seeded ${SEED_USERS.length} users`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
