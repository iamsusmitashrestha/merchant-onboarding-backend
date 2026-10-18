import { hash } from 'bcryptjs';
import dataSource from '../data-source';
import { User } from '../../modules/users/user.entity';
import { SEED_USERS } from './seed-users';

// Safe to run repeatedly: upserts by email.
async function seed(): Promise<void> {
  const password = process.env.SEED_USER_PASSWORD;
  if (!password || password.length < 12) {
    throw new Error('SEED_USER_PASSWORD must be set (min 12 characters)');
  }

  await dataSource.initialize();
  try {
    const passwordHash = await hash(password, 12);
    const users = Object.values(SEED_USERS);
    await dataSource.getRepository(User).upsert(
      users.map((u) => ({ ...u, passwordHash, active: true })),
      ['email'],
    );
    console.log(`Seeded ${users.length} users`);
  } finally {
    await dataSource.destroy();
  }
}

seed().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
