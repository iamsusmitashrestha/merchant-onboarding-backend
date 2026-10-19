import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsEnum, IsOptional } from 'class-validator';
import { UserRole } from '../user-role.enum';

export class ListUsersQueryDto {
  @ApiPropertyOptional({ enum: UserRole, example: UserRole.REVIEWER })
  @IsOptional()
  @IsEnum(UserRole)
  role?: UserRole;
}
