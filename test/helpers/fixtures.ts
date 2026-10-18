import { Server } from 'http';
import request from 'supertest';
import { DataSource } from 'typeorm';
import { MerchantApplication } from '../../src/modules/applications/entities/merchant-application.entity';
import { ApplicationStatus } from '../../src/modules/applications/enums/application-status.enum';
import { BusinessType } from '../../src/modules/applications/enums/business-type.enum';
import { RiskStatus } from '../../src/modules/applications/enums/risk-status.enum';
import { bearer } from './auth';

// Fake data only.
export function applicationInput(overrides: Record<string, unknown> = {}) {
  return {
    businessName: 'Acme Test Shop',
    legalBusinessName: 'Acme Test Shop LLC',
    businessType: BusinessType.LLC,
    ownerName: 'Test Owner',
    ownerEmail: 'owner@example.com',
    ownerPhone: '+1 555 0100',
    taxId: '00-0000001',
    mcc: '5734',
    currency: 'USD',
    expectedMonthlyVolumeMinor: 5_000_000,
    averageTicketMinor: 2_500,
    ...overrides,
  };
}

export interface ApplicationBody {
  id: string;
  status: ApplicationStatus;
  riskStatus: RiskStatus;
  version: number;
  createdById: string;
  assignedReviewerId: string | null;
  [key: string]: unknown;
}

export async function createApplication(
  http: Server,
  token: string,
  overrides: Record<string, unknown> = {},
): Promise<ApplicationBody> {
  const res = await request(http)
    .post('/applications')
    .set(bearer(token))
    .send(applicationInput(overrides))
    .expect(201);
  return res.body as ApplicationBody;
}

// Moves an application straight to a state via SQL, for testing a single
// endpoint in isolation. The full flow through submit is tested separately.
// TypeORM's update() also bumps the version, so callers get the fresh row back.
export async function forceState(
  dataSource: DataSource,
  id: string,
  patch: Partial<
    Pick<
      MerchantApplication,
      'status' | 'riskStatus' | 'assignedReviewerId' | 'submissionVersion'
    >
  >,
): Promise<MerchantApplication> {
  const repo = dataSource.getRepository(MerchantApplication);
  await repo.update(id, patch);
  return repo.findOneByOrFail({ id });
}

export function findApplication(
  dataSource: DataSource,
  id: string,
): Promise<MerchantApplication> {
  return dataSource.getRepository(MerchantApplication).findOneByOrFail({ id });
}

export async function waitFor<T>(
  probe: () => Promise<T>,
  done: (value: T) => boolean,
  { timeoutMs = 5000, intervalMs = 100 } = {},
): Promise<T> {
  const deadline = Date.now() + timeoutMs;
  for (;;) {
    const value = await probe();
    if (done(value)) return value;
    if (Date.now() > deadline) {
      throw new Error(`waitFor timed out after ${timeoutMs}ms`);
    }
    await new Promise((resolve) => setTimeout(resolve, intervalMs));
  }
}
