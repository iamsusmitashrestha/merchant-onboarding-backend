import { ApiProperty } from '@nestjs/swagger';
import { IsUUID } from 'class-validator';

export class AssignReviewerDto {
  @ApiProperty({
    format: 'uuid',
    description: 'An active user with role REVIEWER',
  })
  @IsUUID()
  reviewerId: string;
}
