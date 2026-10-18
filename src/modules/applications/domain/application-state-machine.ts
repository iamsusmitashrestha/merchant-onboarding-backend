import { InvalidTransitionError } from '../../../common/errors';
import { ApplicationStatus } from '../enums/application-status.enum';
import { ReviewDecision } from '../enums/review-decision.enum';
import { RiskStatus } from '../enums/risk-status.enum';

export enum ApplicationAction {
  UPDATE = 'UPDATE',
  SUBMIT = 'SUBMIT',
  COMPLETE_RISK_REVIEW = 'COMPLETE_RISK_REVIEW',
  RETRY_RISK_REVIEW = 'RETRY_RISK_REVIEW',
  ASSIGN = 'ASSIGN',
  APPROVE = 'APPROVE',
  REJECT = 'REJECT',
  REQUEST_INFO = 'REQUEST_INFO',
}

const S = ApplicationStatus;

const TRANSITIONS: Record<
  ApplicationAction,
  Partial<Record<ApplicationStatus, ApplicationStatus>>
> = {
  [ApplicationAction.UPDATE]: {
    [S.DRAFT]: S.DRAFT,
    [S.INFO_REQUESTED]: S.INFO_REQUESTED,
  },
  [ApplicationAction.SUBMIT]: {
    [S.DRAFT]: S.SUBMITTED,
    [S.INFO_REQUESTED]: S.SUBMITTED,
  },
  [ApplicationAction.COMPLETE_RISK_REVIEW]: { [S.SUBMITTED]: S.IN_REVIEW },
  [ApplicationAction.RETRY_RISK_REVIEW]: { [S.SUBMITTED]: S.SUBMITTED },
  [ApplicationAction.ASSIGN]: {
    [S.SUBMITTED]: S.SUBMITTED,
    [S.IN_REVIEW]: S.IN_REVIEW,
  },
  [ApplicationAction.APPROVE]: { [S.IN_REVIEW]: S.APPROVED },
  [ApplicationAction.REJECT]: { [S.IN_REVIEW]: S.REJECTED },
  [ApplicationAction.REQUEST_INFO]: { [S.IN_REVIEW]: S.INFO_REQUESTED },
};

export function nextStatus(
  current: ApplicationStatus,
  action: ApplicationAction,
): ApplicationStatus {
  const next = TRANSITIONS[action][current];
  if (next === undefined) {
    throw new InvalidTransitionError(current, action);
  }
  return next;
}

export function assertCanRetryRiskReview(
  status: ApplicationStatus,
  riskStatus: RiskStatus,
): void {
  nextStatus(status, ApplicationAction.RETRY_RISK_REVIEW);
  if (riskStatus !== RiskStatus.FAILED && riskStatus !== RiskStatus.PENDING) {
    throw new InvalidTransitionError(
      `${status} with risk status ${riskStatus}`,
      ApplicationAction.RETRY_RISK_REVIEW,
    );
  }
}

const DECISION_ACTIONS: Record<ReviewDecision, ApplicationAction> = {
  [ReviewDecision.APPROVE]: ApplicationAction.APPROVE,
  [ReviewDecision.REJECT]: ApplicationAction.REJECT,
  [ReviewDecision.REQUEST_INFO]: ApplicationAction.REQUEST_INFO,
};

export function actionForDecision(decision: ReviewDecision): ApplicationAction {
  return DECISION_ACTIONS[decision];
}

export function isFinalStatus(status: ApplicationStatus): boolean {
  return status === S.APPROVED || status === S.REJECTED;
}
