import { EntityManager } from 'typeorm';
import { REDACTED } from '../../common/redaction/redaction';
import { UserRole } from '../users/user-role.enum';
import { AuditAction } from './audit-action.enum';
import { NonUserActorRole } from './audit-actor-role.enum';
import { AuditEntityType } from './audit-entity-type.enum';
import { AuditLog } from './audit-log.entity';
import { AuditService, SYSTEM_ACTOR } from './audit.service';

describe('AuditService.record', () => {
  const save = jest.fn((row: Partial<AuditLog>) => Promise.resolve(row));
  const em = {
    create: (_entity: unknown, values: Partial<AuditLog>) => values,
    save,
  } as unknown as EntityManager;
  const service = new AuditService();

  beforeEach(() => save.mockReset());

  function insertedRow(): Partial<AuditLog> {
    expect(save).toHaveBeenCalledTimes(1);
    return save.mock.calls[0][0];
  }

  it('redacts secrets and masks sensitive fields even when the caller passes them', async () => {
    await service.record(em, {
      actor: { id: 'u1', role: UserRole.SALES, requestId: 'req-1' },
      action: AuditAction.APPLICATION_CREATED,
      entityType: AuditEntityType.MERCHANT_APPLICATION,
      entityId: 'a1',
      metadata: {
        businessName: 'Acme Test Co',
        password: 'hunter2',
        nested: { accessToken: 'eyJhbGciOi' },
        taxId: '00-0000001',
      },
    });

    expect(insertedRow().metadata).toEqual({
      businessName: 'Acme Test Co',
      password: REDACTED,
      nested: { accessToken: REDACTED },
      taxId: '******0001',
    });
  });

  it('records the actor and request id from the authenticated user', async () => {
    await service.record(em, {
      actor: { id: 'u1', role: UserRole.ADMIN, requestId: 'req-1' },
      action: AuditAction.REVIEWER_ASSIGNED,
      entityType: AuditEntityType.MERCHANT_APPLICATION,
      entityId: 'a1',
    });

    expect(insertedRow()).toMatchObject({
      actorId: 'u1',
      actorRole: UserRole.ADMIN,
      requestId: 'req-1',
      metadata: {},
    });
  });

  it('records worker actions as SYSTEM with no actor id', async () => {
    await service.record(em, {
      actor: SYSTEM_ACTOR,
      action: AuditAction.RISK_ASSESSMENT_COMPLETED,
      entityType: AuditEntityType.MERCHANT_APPLICATION,
      entityId: 'a1',
    });

    expect(insertedRow()).toMatchObject({
      actorId: null,
      actorRole: NonUserActorRole.SYSTEM,
      requestId: null,
    });
  });
});
