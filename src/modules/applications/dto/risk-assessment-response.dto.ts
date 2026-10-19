import { ApiProperty } from '@nestjs/swagger';
import { RiskLevel } from '../../risk/risk-level.enum';
import { RiskAssessment } from '../risk-review/risk-assessment.entity';

export class RiskAssessmentResponseDto {
  @ApiProperty() submissionVersion: number;
  @ApiProperty({ minimum: 0, maximum: 100 }) score: number;
  @ApiProperty({ enum: RiskLevel }) level: RiskLevel;
  @ApiProperty({ type: [String], example: ['HIGH_RISK_MCC'] })
  reasons: string[];
  @ApiProperty() providerReference: string;
  @ApiProperty() createdAt: Date;

  static fromEntity(assessment: RiskAssessment): RiskAssessmentResponseDto {
    return {
      submissionVersion: assessment.submissionVersion,
      score: assessment.score,
      level: assessment.level,
      reasons: assessment.reasons,
      providerReference: assessment.providerReference,
      createdAt: assessment.createdAt,
    };
  }
}
