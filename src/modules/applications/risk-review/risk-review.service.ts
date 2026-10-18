import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager } from 'typeorm';
import { isUniqueViolation } from '../../../common/db-errors';
import { AuditAction } from '../../audit/audit-action.enum';
import { AuditEntityType } from '../../audit/audit-entity-type.enum';
import { AuditService, SYSTEM_ACTOR } from '../../audit/audit.service';
import { RiskAssessmentResult } from '../../risk/risk-provider';
import {
  ApplicationAction,
  nextStatus,
} from '../domain/application-state-machine';
import { MerchantApplication } from '../entities/merchant-application.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { RiskStatus } from '../enums/risk-status.enum';
import {
  RiskAssessment,
  UQ_ONE_ASSESSMENT_PER_SUBMISSION,
} from './risk-assessment.entity';
import { RiskReviewJobData, RiskReviewOutcome } from './risk-review.constants';

// A job is stale when the application has moved on since it was queued.
export function isStale(
  app: Pick<MerchantApplication, 'status' | 'submissionVersion'>,
  submissionVersion: number,
): boolean {
  return (
    app.status !== ApplicationStatus.SUBMITTED ||
    app.submissionVersion !== submissionVersion
  );
}

// Database side of the risk review, used by the worker (actor: SYSTEM).
@Injectable()
export class RiskReviewService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
  ) {}

  findApplication(id: string): Promise<MerchantApplication | null> {
    return this.dataSource.getRepository(MerchantApplication).findOneBy({ id });
  }

  hasAssessment(job: RiskReviewJobData): Promise<boolean> {
    return this.dataSource.getRepository(RiskAssessment).existsBy({
      applicationId: job.applicationId,
      submissionVersion: job.submissionVersion,
    });
  }

  async complete(
    job: RiskReviewJobData,
    result: RiskAssessmentResult,
  ): Promise<RiskReviewOutcome> {
    try {
      return await this.dataSource.transaction(async (em) => {
        const app = await this.lock(em, job.applicationId);
        // Re-checked under the lock: a second worker racing on the same job stops here.
        if (!app || isStale(app, job.submissionVersion)) {
          return RiskReviewOutcome.SKIPPED_STALE;
        }

        await em.save(
          em.create(RiskAssessment, {
            applicationId: app.id,
            submissionVersion: job.submissionVersion,
            score: result.score,
            level: result.level,
            reasons: result.reasons,
            providerReference: result.providerReference,
          }),
        );
        app.status = nextStatus(
          app.status,
          ApplicationAction.COMPLETE_RISK_REVIEW,
        );
        app.riskStatus = RiskStatus.COMPLETED;
        app.riskLevel = result.level;
        await em.save(app);
        await this.audit.record(em, {
          actor: SYSTEM_ACTOR,
          action: AuditAction.RISK_ASSESSMENT_COMPLETED,
          entityType: AuditEntityType.MERCHANT_APPLICATION,
          entityId: app.id,
          metadata: {
            submissionVersion: job.submissionVersion,
            riskLevel: result.level,
            score: result.score,
          },
        });
        return RiskReviewOutcome.COMPLETED;
      });
    } catch (err) {
      // The transaction has already rolled back: another attempt stored this
      // submission's assessment first, which is the result we wanted anyway.
      if (isUniqueViolation(err, UQ_ONE_ASSESSMENT_PER_SUBMISSION)) {
        return RiskReviewOutcome.SKIPPED_DUPLICATE;
      }
      throw err;
    }
  }

  markFailed(
    job: RiskReviewJobData,
    errorClass: string,
    attempts: number,
  ): Promise<void> {
    return this.dataSource.transaction(async (em) => {
      const app = await this.lock(em, job.applicationId);
      if (
        !app ||
        isStale(app, job.submissionVersion) ||
        app.riskStatus !== RiskStatus.PENDING
      ) {
        return;
      }

      app.riskStatus = RiskStatus.FAILED;
      await em.save(app);
      await this.audit.record(em, {
        actor: SYSTEM_ACTOR,
        action: AuditAction.RISK_ASSESSMENT_FAILED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: {
          submissionVersion: job.submissionVersion,
          errorClass,
          attempts,
        },
      });
    });
  }

  private lock(
    em: EntityManager,
    id: string,
  ): Promise<MerchantApplication | null> {
    return em
      .createQueryBuilder(MerchantApplication, 'app')
      .where('app.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
  }
}
