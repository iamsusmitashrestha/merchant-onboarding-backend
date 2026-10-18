import { ApiProperty } from '@nestjs/swagger';
import { IsEnum, IsString, Length } from 'class-validator';
import { ReviewDecision } from '../enums/review-decision.enum';

export class RecordDecisionDto {
  @ApiProperty({ enum: ReviewDecision })
  @IsEnum(ReviewDecision)
  decision: ReviewDecision;

  @ApiProperty({ example: 'All KYB checks passed' })
  @IsString()
  @Length(3, 1000)
  reason: string;
}
