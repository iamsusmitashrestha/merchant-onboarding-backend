import { ConfigService } from '@nestjs/config';
import { EnvironmentVariables } from '../../config/env.validation';
import { RiskLevel } from './risk-level.enum';
import {
  PermanentProviderError,
  RiskAssessmentInput,
  TransientProviderError,
} from './risk-provider';
import {
  INVALID_MCC,
  scoreApplication,
  SimulatedKybProvider,
} from './simulated-kyb.provider';

const input: RiskAssessmentInput = {
  applicationId: 'app-1',
  legalBusinessName: 'Acme Test Shop LLC',
  businessType: 'LLC',
  mcc: '5734',
  expectedMonthlyVolumeMinor: 5_000_000,
};

function provider(failureRate: number): SimulatedKybProvider {
  const values = { RISK_SIM_LATENCY_MS: 0, RISK_SIM_FAILURE_RATE: failureRate };
  const config = {
    get: (key: keyof typeof values) => values[key],
  } as unknown as ConfigService<EnvironmentVariables, true>;
  return new SimulatedKybProvider(config);
}

describe('scoreApplication', () => {
  it('returns the same result for the same application', () => {
    expect(scoreApplication(input)).toEqual(scoreApplication({ ...input }));
  });

  it('rates a high-risk MCC (gambling) as HIGH', () => {
    const result = scoreApplication({ ...input, mcc: '7995' });
    expect(result.level).toBe(RiskLevel.HIGH);
    expect(result.reasons).toContain('HIGH_RISK_MCC');
  });

  it('never rates an ordinary MCC as HIGH, even at high volume', () => {
    for (const name of ['A Co', 'B Co', 'C Co', 'D Co', 'E Co', 'F Co']) {
      const result = scoreApplication({
        ...input,
        legalBusinessName: name,
        expectedMonthlyVolumeMinor: 500_000_000,
      });
      expect(result.level).not.toBe(RiskLevel.HIGH);
    }
  });

  it('keeps the score between 0 and 100', () => {
    const result = scoreApplication({
      ...input,
      mcc: '7995',
      expectedMonthlyVolumeMinor: 500_000_000,
    });
    expect(result.score).toBeLessThanOrEqual(100);
  });
});

describe('SimulatedKybProvider', () => {
  it('returns the deterministic score when the call succeeds', async () => {
    await expect(provider(0).assess(input)).resolves.toEqual(
      scoreApplication(input),
    );
  });

  it('throws a transient (retryable) error on a simulated outage', async () => {
    await expect(provider(1).assess(input)).rejects.toBeInstanceOf(
      TransientProviderError,
    );
  });

  it('throws a permanent error for input the provider rejects', async () => {
    await expect(
      provider(0).assess({ ...input, mcc: INVALID_MCC }),
    ).rejects.toBeInstanceOf(PermanentProviderError);
  });
});
