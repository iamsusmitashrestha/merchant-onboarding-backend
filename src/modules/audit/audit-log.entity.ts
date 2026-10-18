import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { AuditAction } from './audit-action.enum';
import type { AuditActorRole } from './audit-actor-role.enum';
import { AuditEntityType } from './audit-entity-type.enum';

@Entity({ name: 'audit_logs' })
@Index('idx_audit_logs_entity_type_entity_id_created_at', [
  'entityType',
  'entityId',
  'createdAt',
])
@Index('idx_audit_logs_actor_id_created_at', ['actorId', 'createdAt'])
export class AuditLog {
  @PrimaryGeneratedColumn('uuid', { primaryKeyConstraintName: 'pk_audit_logs' })
  id: string;

  @Column({ type: 'uuid', nullable: true })
  actorId: string | null;

  @Column({ type: 'varchar', length: 16 })
  actorRole: AuditActorRole;

  @Column({ type: 'enum', enum: AuditAction, enumName: 'audit_action_enum' })
  action: AuditAction;

  @Column({ type: 'varchar', length: 50 })
  entityType: AuditEntityType;

  @Column({ type: 'uuid', nullable: true })
  entityId: string | null;

  @Column({ type: 'jsonb' })
  metadata: Record<string, unknown>;

  @Column({ type: 'varchar', length: 100, nullable: true })
  requestId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
