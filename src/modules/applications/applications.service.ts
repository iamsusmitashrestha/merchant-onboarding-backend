import { Injectable } from '@nestjs/common';
import { DataSource, EntityManager, SelectQueryBuilder } from 'typeorm';
import {
  ConflictError,
  InvalidRequestError,
  NotFoundError,
} from '../../common/errors';
import { AuditAction } from '../audit/audit-action.enum';
import { AuditEntityType } from '../audit/audit-entity-type.enum';
import { AuditService } from '../audit/audit.service';
import { AuthUser } from '../auth/auth.decorators';
import { UserRole } from '../users/user-role.enum';
import { UsersService } from '../users/users.service';
import {
  applicationScopeFor,
  assertCanDecide,
} from './domain/application-access.policy';
import {
  actionForDecision,
  ApplicationAction,
  isFinalStatus,
  nextStatus,
} from './domain/application-state-machine';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';
import { MerchantApplication } from './entities/merchant-application.entity';
import { ApplicationStatus } from './enums/application-status.enum';
import { RiskStatus } from './enums/risk-status.enum';

const EDITABLE_FIELDS = [
  'businessName',
  'legalBusinessName',
  'businessType',
  'ownerName',
  'ownerEmail',
  'ownerPhone',
  'taxId',
  'mcc',
  'currency',
  'expectedMonthlyVolumeMinor',
  'averageTicketMinor',
] as const satisfies ReadonlyArray<keyof CreateApplicationDto>;

@Injectable()
export class ApplicationsService {
  constructor(
    private readonly dataSource: DataSource,
    private readonly audit: AuditService,
    private readonly users: UsersService,
  ) {}

  create(
    user: AuthUser,
    dto: CreateApplicationDto,
  ): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (em) => {
      const app = em.create(MerchantApplication, {
        ...dto,
        createdById: user.id,
        status: ApplicationStatus.DRAFT,
        riskStatus: RiskStatus.NOT_STARTED,
        riskLevel: null,
        decisionReason: null,
        assignedReviewerId: null,
        submissionVersion: 0,
        submittedAt: null,
        decidedAt: null,
      });
      await em.save(app);
      await this.audit.record(em, {
        actor: user,
        action: AuditAction.APPLICATION_CREATED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: {
          businessName: app.businessName,
          businessType: app.businessType,
        },
      });
      return app;
    });
  }

  async findOne(user: AuthUser, id: string): Promise<MerchantApplication> {
    const app = await this.scopedQuery(this.dataSource.manager, user)
      .andWhere('app.id = :id', { id })
      .getOne();
    if (!app) throw new NotFoundError('Application');
    return app;
  }

  async list(
    user: AuthUser,
    query: ListApplicationsQueryDto,
  ): Promise<{ items: MerchantApplication[]; total: number }> {
    const qb = this.scopedQuery(this.dataSource.manager, user);
    if (query.status) {
      qb.andWhere('app.status = :status', { status: query.status });
    }
    const [items, total] = await qb
      .orderBy('app.createdAt', 'DESC')
      .addOrderBy('app.id', 'DESC')
      .skip((query.page - 1) * query.limit)
      .take(query.limit)
      .getManyAndCount();
    return { items, total };
  }

  update(
    user: AuthUser,
    id: string,
    dto: UpdateApplicationDto,
  ): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (em) => {
      const app = await this.lockForUpdate(em, user, id);
      nextStatus(app.status, ApplicationAction.UPDATE);
      if (app.version !== dto.expectedVersion) {
        throw new ConflictError(
          `Application was modified (current version ${app.version}); reload and retry`,
        );
      }

      const changedFields = EDITABLE_FIELDS.filter(
        (field) => dto[field] !== undefined && dto[field] !== app[field],
      );
      if (changedFields.length === 0) return app;

      for (const field of changedFields) {
        Object.assign(app, { [field]: dto[field] });
      }
      await em.save(app);
      await this.audit.record(em, {
        actor: user,
        action: AuditAction.APPLICATION_UPDATED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: { changedFields },
      });
      return app;
    });
  }

  async assign(
    user: AuthUser,
    id: string,
    dto: AssignReviewerDto,
  ): Promise<MerchantApplication> {
    const reviewer = await this.users.findById(dto.reviewerId);
    if (!reviewer || !reviewer.active || reviewer.role !== UserRole.REVIEWER) {
      throw new InvalidRequestError(
        'reviewerId must belong to an active REVIEWER',
      );
    }

    return this.dataSource.transaction(async (em) => {
      const app = await this.lockForUpdate(em, user, id);
      nextStatus(app.status, ApplicationAction.ASSIGN);

      const fromReviewerId = app.assignedReviewerId;
      app.assignedReviewerId = reviewer.id;
      await em.save(app);
      await this.audit.record(em, {
        actor: user,
        action: AuditAction.REVIEWER_ASSIGNED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: { fromReviewerId, toReviewerId: reviewer.id },
      });
      return app;
    });
  }

  decide(
    user: AuthUser,
    id: string,
    dto: RecordDecisionDto,
  ): Promise<MerchantApplication> {
    return this.dataSource.transaction(async (em) => {
      const app = await this.lockForUpdate(em, user, id);
      // Checked under the lock, so a concurrent reassignment can't slip in.
      assertCanDecide(user, app);

      const fromStatus = app.status;
      app.status = nextStatus(app.status, actionForDecision(dto.decision));
      app.decisionReason = dto.reason;
      if (isFinalStatus(app.status)) app.decidedAt = new Date();
      await em.save(app);
      await this.audit.record(em, {
        actor: user,
        action: AuditAction.DECISION_RECORDED,
        entityType: AuditEntityType.MERCHANT_APPLICATION,
        entityId: app.id,
        metadata: { fromStatus, toStatus: app.status, reason: dto.reason },
      });
      return app;
    });
  }

  // Every application query starts here. Callers may only add andWhere(),
  // so a filter can narrow the caller's scope but never widen it (ADR 0002).
  private scopedQuery(
    em: EntityManager,
    user: AuthUser,
  ): SelectQueryBuilder<MerchantApplication> {
    const scope = applicationScopeFor(user);
    const qb = em.createQueryBuilder(MerchantApplication, 'app');
    if (scope.ownerId) {
      qb.andWhere('app.createdById = :ownerId', { ownerId: scope.ownerId });
    }
    if (scope.hideDrafts) {
      qb.andWhere('app.status <> :draft', { draft: ApplicationStatus.DRAFT });
    }
    return qb;
  }

  private async lockForUpdate(
    em: EntityManager,
    user: AuthUser,
    id: string,
  ): Promise<MerchantApplication> {
    const app = await this.scopedQuery(em, user)
      .andWhere('app.id = :id', { id })
      .setLock('pessimistic_write')
      .getOne();
    if (!app) throw new NotFoundError('Application');
    return app;
  }
}
