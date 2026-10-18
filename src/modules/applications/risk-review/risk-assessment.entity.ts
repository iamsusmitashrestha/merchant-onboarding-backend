import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import { RiskLevel } from '../../risk/risk-level.enum';
import { MerchantApplication } from '../entities/merchant-application.entity';

// The worker's idempotency guard: at most one assessment per submission (ADR 0004).
export const UQ_ONE_ASSESSMENT_PER_SUBMISSION =
  'uq_risk_assessments_application_id_submission_version';

@Entity({ name: 'risk_assessments' })
@Unique(UQ_ONE_ASSESSMENT_PER_SUBMISSION, [
  'applicationId',
  'submissionVersion',
])
export class RiskAssessment {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_risk_assessments',
  })
  id: string;

  @Column({ type: 'uuid' })
  applicationId: string;

  @ManyToOne(() => MerchantApplication, {
    onDelete: 'RESTRICT',
    nullable: false,
  })
  @JoinColumn({
    name: 'application_id',
    foreignKeyConstraintName: 'fk_risk_assessments_application_id',
  })
  application?: MerchantApplication;

  @Column({ type: 'int' })
  submissionVersion: number;

  @Column({ type: 'int' })
  score: number;

  @Column({ type: 'enum', enum: RiskLevel, enumName: 'risk_level_enum' })
  level: RiskLevel;

  @Column({ type: 'jsonb' })
  reasons: string[];

  @Column({ type: 'varchar', length: 100 })
  providerReference: string;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;
}
