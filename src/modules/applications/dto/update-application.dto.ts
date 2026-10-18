import { ApiProperty, PartialType } from '@nestjs/swagger';
import { IsInt, Min } from 'class-validator';
import { CreateApplicationDto } from './create-application.dto';

export class UpdateApplicationDto extends PartialType(CreateApplicationDto) {
  @ApiProperty({
    example: 1,
    description:
      'The `version` you last read. A mismatch returns 409 instead of overwriting a concurrent edit (ADR 0008).',
  })
  @IsInt()
  @Min(1)
  expectedVersion: number;
}
