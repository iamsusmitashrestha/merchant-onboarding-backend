import { ApiProperty } from '@nestjs/swagger';
import { IsInt, IsUUID, Min } from 'class-validator';

export class AssignReviewerDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active user with role REVIEWER',
  })
  @IsUUID()
  reviewerId: string;

  @ApiProperty({
    example: 2,
    description:
      'The `version` you last read. A mismatch returns 409 instead of overwriting a concurrent assignment (ADR 0008).',
  })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}
