import { ForbiddenActionError } from '../../../common/errors';
import { UserRole } from '../../users/user-role.enum';
import {
  Actor,
  applicationScopeFor,
  assertCanDecide,
} from './application-access.policy';

const sales: Actor = { id: 'sales-1', role: UserRole.SALES };
const reviewer: Actor = { id: 'reviewer-1', role: UserRole.REVIEWER };
const otherReviewer: Actor = { id: 'reviewer-2', role: UserRole.REVIEWER };
const admin: Actor = { id: 'admin-1', role: UserRole.ADMIN };

describe('applicationScopeFor', () => {
  it('limits SALES to the applications they created', () => {
    expect(applicationScopeFor(sales)).toEqual({
      ownerId: 'sales-1',
      hideDrafts: false,
    });
  });

  it('lets REVIEWER see every application except drafts', () => {
    expect(applicationScopeFor(reviewer)).toEqual({
      ownerId: null,
      hideDrafts: true,
    });
  });

  it('lets ADMIN see everything', () => {
    expect(applicationScopeFor(admin)).toEqual({
      ownerId: null,
      hideDrafts: false,
    });
  });

  it('fails closed for an unknown role', () => {
    const unknown = { id: 'x', role: 'AUDITOR' as UserRole };
    expect(() => applicationScopeFor(unknown)).toThrow(ForbiddenActionError);
  });
});

describe('assertCanDecide', () => {
  const assignedToReviewer = { assignedReviewerId: 'reviewer-1' };

  it('allows the assigned reviewer', () => {
    expect(() => assertCanDecide(reviewer, assignedToReviewer)).not.toThrow();
  });

  it('rejects a reviewer who is not assigned', () => {
    expect(() => assertCanDecide(otherReviewer, assignedToReviewer)).toThrow(
      ForbiddenActionError,
    );
  });

  it('rejects any reviewer when nobody is assigned', () => {
    expect(() =>
      assertCanDecide(reviewer, { assignedReviewerId: null }),
    ).toThrow(ForbiddenActionError);
  });

  it('rejects ADMIN even with full operational access', () => {
    expect(() =>
      assertCanDecide(admin, { assignedReviewerId: 'admin-1' }),
    ).toThrow(ForbiddenActionError);
  });

  it('rejects SALES even if their id were somehow assigned', () => {
    expect(() =>
      assertCanDecide(sales, { assignedReviewerId: 'sales-1' }),
    ).toThrow(ForbiddenActionError);
  });
});
