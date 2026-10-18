import { InvalidTransitionError } from '../../../common/errors';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ReviewDecision } from '../enums/review-decision.enum';
import { RiskStatus } from '../enums/risk-status.enum';
import {
  actionForDecision,
  ApplicationAction,
  assertCanRetryRiskReview,
  isFinalStatus,
  nextStatus,
} from './application-state-machine';

const S = ApplicationStatus;
const A = ApplicationAction;

// The specification, written out independently of the implementation table.
const ALLOWED: Array<
  [ApplicationAction, ApplicationStatus, ApplicationStatus]
> = [
  [A.UPDATE, S.DRAFT, S.DRAFT],
  [A.UPDATE, S.INFO_REQUESTED, S.INFO_REQUESTED],
  [A.SUBMIT, S.DRAFT, S.SUBMITTED],
  [A.SUBMIT, S.INFO_REQUESTED, S.SUBMITTED],
  [A.COMPLETE_RISK_REVIEW, S.SUBMITTED, S.IN_REVIEW],
  [A.RETRY_RISK_REVIEW, S.SUBMITTED, S.SUBMITTED],
  [A.ASSIGN, S.SUBMITTED, S.SUBMITTED],
  [A.ASSIGN, S.IN_REVIEW, S.IN_REVIEW],
  [A.APPROVE, S.IN_REVIEW, S.APPROVED],
  [A.REJECT, S.IN_REVIEW, S.REJECTED],
  [A.REQUEST_INFO, S.IN_REVIEW, S.INFO_REQUESTED],
];

const allPairs = Object.values(ApplicationAction).flatMap((action) =>
  Object.values(ApplicationStatus).map((status) => [action, status] as const),
);

const isAllowed = (action: ApplicationAction, status: ApplicationStatus) =>
  ALLOWED.some(([a, s]) => a === action && s === status);

describe('application state machine', () => {
  it.each(ALLOWED)('%s from %s moves to %s', (action, from, to) => {
    expect(nextStatus(from, action)).toBe(to);
  });

  it.each(allPairs.filter(([action, status]) => !isAllowed(action, status)))(
    'rejects %s from %s',
    (action, status) => {
      expect(() => nextStatus(status, action)).toThrow(InvalidTransitionError);
    },
  );

  it('covers every status × action pair', () => {
    expect(allPairs).toHaveLength(
      Object.values(ApplicationAction).length *
        Object.values(ApplicationStatus).length,
    );
  });

  it('treats APPROVED and REJECTED as terminal: no action is allowed', () => {
    for (const status of [S.APPROVED, S.REJECTED]) {
      expect(isFinalStatus(status)).toBe(true);
      for (const action of Object.values(ApplicationAction)) {
        expect(() => nextStatus(status, action)).toThrow(
          InvalidTransitionError,
        );
      }
    }
  });

  it('only allows editing in DRAFT and INFO_REQUESTED', () => {
    const editable = Object.values(ApplicationStatus).filter((status) =>
      isAllowed(A.UPDATE, status),
    );
    expect(editable).toEqual([S.DRAFT, S.INFO_REQUESTED]);
  });
});

describe('risk review retry', () => {
  it.each([RiskStatus.FAILED, RiskStatus.PENDING])(
    'is allowed for SUBMITTED with risk status %s',
    (riskStatus) => {
      expect(() =>
        assertCanRetryRiskReview(S.SUBMITTED, riskStatus),
      ).not.toThrow();
    },
  );

  it.each([RiskStatus.NOT_STARTED, RiskStatus.COMPLETED])(
    'is rejected for SUBMITTED with risk status %s',
    (riskStatus) => {
      expect(() => assertCanRetryRiskReview(S.SUBMITTED, riskStatus)).toThrow(
        InvalidTransitionError,
      );
    },
  );

  it('is rejected once the application has left SUBMITTED', () => {
    expect(() =>
      assertCanRetryRiskReview(S.IN_REVIEW, RiskStatus.FAILED),
    ).toThrow(InvalidTransitionError);
  });
});

describe('review decisions', () => {
  it.each([
    [ReviewDecision.APPROVE, S.APPROVED],
    [ReviewDecision.REJECT, S.REJECTED],
    [ReviewDecision.REQUEST_INFO, S.INFO_REQUESTED],
  ])('%s from IN_REVIEW moves to %s', (decision, to) => {
    expect(nextStatus(S.IN_REVIEW, actionForDecision(decision))).toBe(to);
  });
});
