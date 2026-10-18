import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { createHash } from 'crypto';
import { EnvironmentVariables } from '../../config/env.validation';
import { RiskLevel } from './risk-level.enum';
import {
  PermanentProviderError,
  RiskAssessmentInput,
  RiskAssessmentResult,
  RiskProvider,
  TransientProviderError,
} from './risk-provider';

export const HIGH_RISK_MCCS = ['7995', '5967', '6051', '5993'];
export const INVALID_MCC = '0000';
const HIGH_VOLUME_MINOR = 100_000_000;

@Injectable()
export class SimulatedKybProvider implements RiskProvider {
  private readonly latencyMs: number;
  private readonly failureRate: number;

  constructor(config: ConfigService<EnvironmentVariables, true>) {
    this.latencyMs = config.get('RISK_SIM_LATENCY_MS', { infer: true });
    this.failureRate = config.get('RISK_SIM_FAILURE_RATE', { infer: true });
  }

  async assess(input: RiskAssessmentInput): Promise<RiskAssessmentResult> {
    if (this.latencyMs > 0) {
      await new Promise((resolve) => setTimeout(resolve, this.latencyMs));
    }
    if (Math.random() < this.failureRate) {
      throw new TransientProviderError('Simulated KYB provider timeout');
    }
    if (input.mcc === INVALID_MCC) {
      throw new PermanentProviderError('KYB provider rejected the MCC');
    }
    return scoreApplication(input);
  }
}

// Deterministic: the same application always gets the same result.
export function scoreApplication(
  input: RiskAssessmentInput,
): RiskAssessmentResult {
  const digest = createHash('sha256')
    .update(`${input.legalBusinessName.trim().toLowerCase()}|${input.mcc}`)
    .digest('hex');

  const reasons: string[] = [];
  let score = parseInt(digest.slice(0, 8), 16) % 60;
  if (HIGH_RISK_MCCS.includes(input.mcc)) {
    score += 70;
    reasons.push('HIGH_RISK_MCC');
  }
  if (input.expectedMonthlyVolumeMinor > HIGH_VOLUME_MINOR) {
    score += 10;
    reasons.push('HIGH_VOLUME');
  }
  score = Math.min(score, 100);

  const level =
    score >= 70
      ? RiskLevel.HIGH
      : score >= 40
        ? RiskLevel.MEDIUM
        : RiskLevel.LOW;
  return {
    score,
    level,
    reasons,
    providerReference: `sim-${digest.slice(0, 12)}`,
  };
}
