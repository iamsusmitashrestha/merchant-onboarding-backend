import {
  Column,
  CreateDateColumn,
  Entity,
  PrimaryGeneratedColumn,
  Unique,
  UpdateDateColumn,
} from 'typeorm';
import { Role } from './role.enum';

@Entity({ name: 'users' })
@Unique('uq_users_email', ['email'])
export class User {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_users' })
  id: string;

  /** Stored lower-cased; uniqueness is enforced by the DB. */
  @Column({ type: 'varchar', length: 320 })
  email: string;

  /** bcrypt hash. `select: false` so it is only loaded when explicitly asked for (login). */
  @Column({ type: 'varchar', length: 100, select: false })
  passwordHash: string;

  @Column({ type: 'enum', enum: Role, enumName: 'user_role_enum' })
  role: Role;

  /** Deactivated users are rejected even if they hold a valid token. */
  @Column({ type: 'boolean', default: true })
  active: boolean;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
