import { ForbiddenActionError } from '../../../common/errors';
import { UserRole } from '../../users/user-role.enum';

export interface Actor {
  id: string;
  role: UserRole;
}

export interface ApplicationScope {
  ownerId: string | null;
  hideDrafts: boolean;
}

export function applicationScopeFor(actor: Actor): ApplicationScope {
  switch (actor.role) {
    case UserRole.SALES:
      return { ownerId: actor.id, hideDrafts: false };
    case UserRole.REVIEWER:
      return { ownerId: null, hideDrafts: true };
    case UserRole.ADMIN:
      return { ownerId: null, hideDrafts: false };
    default:
      // Fail closed if a new role is added without a scope.
      throw new ForbiddenActionError('Unknown role');
  }
}

export function assertCanDecide(
  actor: Actor,
  app: { assignedReviewerId: string | null },
): void {
  if (actor.role !== UserRole.REVIEWER || app.assignedReviewerId !== actor.id) {
    throw new ForbiddenActionError(
      'Only the assigned reviewer can record a decision',
    );
  }
}
