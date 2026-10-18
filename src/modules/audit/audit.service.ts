import { Injectable } from '@nestjs/common';
import { EntityManager } from 'typeorm';
import { redact } from '../../common/redaction/redaction';
import { AuditAction } from './audit-action.enum';
import { AuditActorRole, NonUserActorRole } from './audit-actor-role.enum';
import { AuditEntityType } from './audit-entity-type.enum';
import { AuditLog } from './audit-log.entity';

export interface AuditActor {
  id: string | null;
  role: AuditActorRole;
  requestId?: string;
}

export const SYSTEM_ACTOR: AuditActor = {
  id: null,
  role: NonUserActorRole.SYSTEM,
};

export interface AuditEntry {
  actor: AuditActor;
  action: AuditAction;
  entityType: AuditEntityType;
  entityId: string | null;
  metadata?: Record<string, unknown>;
}

@Injectable()
export class AuditService {
  async record(em: EntityManager, entry: AuditEntry): Promise<void> {
    const row = em.create(AuditLog, {
      actorId: entry.actor.id,
      actorRole: entry.actor.role,
      requestId: entry.actor.requestId ?? null,
      action: entry.action,
      entityType: entry.entityType,
      entityId: entry.entityId,
      metadata: redact(entry.metadata ?? {}),
    });
    await em.save(row);
  }
}
