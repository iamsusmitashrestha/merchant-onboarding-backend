import { RiskLevel } from './risk-level.enum';

export const RISK_PROVIDER = Symbol('RISK_PROVIDER');

export interface RiskAssessmentInput {
  applicationId: string;
  legalBusinessName: string;
  businessType: string;
  mcc: string;
  expectedMonthlyVolumeMinor: number;
}

export interface RiskAssessmentResult {
  score: number;
  level: RiskLevel;
  reasons: string[];
  providerReference: string;
}

// A third-party KYB/risk API. Swappable: the simulator in dev, a stub in tests.
export interface RiskProvider {
  assess(input: RiskAssessmentInput): Promise<RiskAssessmentResult>;
}

// Timeouts, 5xx, rate limits: worth retrying.
export class TransientProviderError extends Error {
  override name = 'TransientProviderError';
}

// The provider rejected the input itself: retrying cannot help.
export class PermanentProviderError extends Error {
  override name = 'PermanentProviderError';
}
