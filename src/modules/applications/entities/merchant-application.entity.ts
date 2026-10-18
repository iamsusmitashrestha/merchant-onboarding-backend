import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  UpdateDateColumn,
  VersionColumn,
} from 'typeorm';
import { bigintTransformer } from '../../../common/bigint.transformer';
import { User } from '../../users/user.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { BusinessType } from '../enums/business-type.enum';
import { RiskLevel } from '../../risk/risk-level.enum';
import { RiskStatus } from '../enums/risk-status.enum';

@Entity({ name: 'merchant_applications' })
@Index('idx_merchant_applications_created_by_id_created_at', [
  'createdById',
  'createdAt',
])
@Index('idx_merchant_applications_status_created_at', ['status', 'createdAt'])
@Index('idx_merchant_applications_assigned_reviewer_id', ['assignedReviewerId'])
export class MerchantApplication {
  @PrimaryGeneratedColumn('uuid', {
    primaryKeyConstraintName: 'pk_merchant_applications',
  })
  id: string;

  @Column({ type: 'varchar', length: 200 })
  businessName: string;

  @Column({ type: 'varchar', length: 200 })
  legalBusinessName: string;

  @Column({ type: 'enum', enum: BusinessType, enumName: 'business_type_enum' })
  businessType: BusinessType;

  @Column({ type: 'varchar', length: 200 })
  ownerName: string;

  @Column({ type: 'varchar', length: 320 })
  ownerEmail: string;

  @Column({ type: 'varchar', length: 32 })
  ownerPhone: string;

  @Column({ type: 'varchar', length: 32 })
  taxId: string;

  @Column({ type: 'varchar', length: 4 })
  mcc: string;

  @Column({ type: 'varchar', length: 3 })
  currency: string;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  expectedMonthlyVolumeMinor: number;

  @Column({ type: 'bigint', transformer: bigintTransformer })
  averageTicketMinor: number;

  @Column({
    type: 'enum',
    enum: ApplicationStatus,
    enumName: 'application_status_enum',
    default: ApplicationStatus.DRAFT,
  })
  status: ApplicationStatus;

  @Column({
    type: 'enum',
    enum: RiskStatus,
    enumName: 'risk_status_enum',
    default: RiskStatus.NOT_STARTED,
  })
  riskStatus: RiskStatus;

  @Column({
    type: 'enum',
    enum: RiskLevel,
    enumName: 'risk_level_enum',
    nullable: true,
  })
  riskLevel: RiskLevel | null;

  @Column({ type: 'text', nullable: true })
  decisionReason: string | null;

  @Column({ type: 'uuid' })
  createdById: string;

  // Relations exist for the foreign keys only; never load them in a locked query.
  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: false })
  @JoinColumn({
    name: 'created_by_id',
    foreignKeyConstraintName: 'fk_merchant_applications_created_by_id',
  })
  createdBy?: User;

  @Column({ type: 'uuid', nullable: true })
  assignedReviewerId: string | null;

  @ManyToOne(() => User, { onDelete: 'RESTRICT', nullable: true })
  @JoinColumn({
    name: 'assigned_reviewer_id',
    foreignKeyConstraintName: 'fk_merchant_applications_assigned_reviewer_id',
  })
  assignedReviewer?: User | null;

  @Column({ type: 'int', default: 0 })
  submissionVersion: number;

  @VersionColumn()
  version: number;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;

  @Column({ type: 'timestamptz', nullable: true })
  submittedAt: Date | null;

  @Column({ type: 'timestamptz', nullable: true })
  decidedAt: Date | null;
}
