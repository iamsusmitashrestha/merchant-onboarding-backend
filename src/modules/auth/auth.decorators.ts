import {
  createParamDecorator,
  ExecutionContext,
  SetMetadata,
} from '@nestjs/common';
import { UserRole } from '../users/user-role.enum';

export const IS_PUBLIC_KEY = 'isPublic';
export const ROLES_KEY = 'roles';

/** Opt a route out of the global JWT guard (login, health). */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);

/** Restrict a route to the given roles. Checked by the global RolesGuard. */
export const Roles = (...roles: UserRole[]) => SetMetadata(ROLES_KEY, roles);

/** The authenticated user, as loaded from the DB by the JWT strategy. */
export interface AuthUser {
  id: string;
  email: string;
  role: UserRole;
  requestId?: string;
}

export const CurrentUser = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): AuthUser => {
    const req = ctx.switchToHttp().getRequest<{ user: AuthUser }>();
    return req.user;
  },
);
