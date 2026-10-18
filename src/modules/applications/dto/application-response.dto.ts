import { ApiProperty } from '@nestjs/swagger';
import { maskLast4 } from '../../../common/redaction/redaction';
import { MerchantApplication } from '../entities/merchant-application.entity';
import { ApplicationStatus } from '../enums/application-status.enum';
import { BusinessType } from '../enums/business-type.enum';
import { RiskLevel } from '../enums/risk-level.enum';
import { RiskStatus } from '../enums/risk-status.enum';

export class ApplicationResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() businessName: string;
  @ApiProperty() legalBusinessName: string;
  @ApiProperty({ enum: BusinessType }) businessType: BusinessType;
  @ApiProperty() ownerName: string;
  @ApiProperty() ownerEmail: string;
  @ApiProperty({ example: '*******0100', description: 'Masked' })
  ownerPhone: string | null;
  @ApiProperty({ example: '******0001', description: 'Masked' })
  taxId: string | null;
  @ApiProperty() mcc: string;
  @ApiProperty() currency: string;
  @ApiProperty() expectedMonthlyVolumeMinor: number;
  @ApiProperty() averageTicketMinor: number;
  @ApiProperty({ enum: ApplicationStatus }) status: ApplicationStatus;
  @ApiProperty({ enum: RiskStatus }) riskStatus: RiskStatus;
  @ApiProperty({ enum: RiskLevel, nullable: true }) riskLevel: RiskLevel | null;
  @ApiProperty({ type: String, nullable: true }) decisionReason: string | null;
  @ApiProperty({ format: 'uuid' }) createdById: string;
  @ApiProperty({ type: String, format: 'uuid', nullable: true })
  assignedReviewerId: string | null;
  @ApiProperty() submissionVersion: number;
  @ApiProperty({ description: 'Send back as expectedVersion when updating' })
  version: number;
  @ApiProperty() createdAt: Date;
  @ApiProperty() updatedAt: Date;
  @ApiProperty({ type: Date, nullable: true }) submittedAt: Date | null;
  @ApiProperty({ type: Date, nullable: true }) decidedAt: Date | null;

  static fromEntity(app: MerchantApplication): ApplicationResponseDto {
    return {
      id: app.id,
      businessName: app.businessName,
      legalBusinessName: app.legalBusinessName,
      businessType: app.businessType,
      ownerName: app.ownerName,
      ownerEmail: app.ownerEmail,
      ownerPhone: maskLast4(app.ownerPhone),
      taxId: maskLast4(app.taxId),
      mcc: app.mcc,
      currency: app.currency,
      expectedMonthlyVolumeMinor: app.expectedMonthlyVolumeMinor,
      averageTicketMinor: app.averageTicketMinor,
      status: app.status,
      riskStatus: app.riskStatus,
      riskLevel: app.riskLevel,
      decisionReason: app.decisionReason,
      createdById: app.createdById,
      assignedReviewerId: app.assignedReviewerId,
      submissionVersion: app.submissionVersion,
      version: app.version,
      createdAt: app.createdAt,
      updatedAt: app.updatedAt,
      submittedAt: app.submittedAt,
      decidedAt: app.decidedAt,
    };
  }
}

export class PageMetaDto {
  @ApiProperty() page: number;
  @ApiProperty() limit: number;
  @ApiProperty() total: number;
}

export class ApplicationPageDto {
  @ApiProperty({ type: [ApplicationResponseDto] })
  data: ApplicationResponseDto[];

  @ApiProperty({ type: PageMetaDto })
  meta: PageMetaDto;
}
