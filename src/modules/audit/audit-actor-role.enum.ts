import { UserRole } from '../users/user-role.enum';

export enum NonUserActorRole {
  SYSTEM = 'SYSTEM',
  ANONYMOUS = 'ANONYMOUS',
}

export type AuditActorRole = UserRole | NonUserActorRole;
