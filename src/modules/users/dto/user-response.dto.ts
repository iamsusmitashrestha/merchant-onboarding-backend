import { ApiProperty } from '@nestjs/swagger';
import { UserRole } from '../user-role.enum';
import { User } from '../user.entity';

export class UserResponseDto {
  @ApiProperty({ format: 'uuid' }) id: string;
  @ApiProperty() email: string;
  @ApiProperty({ enum: UserRole }) role: UserRole;
  @ApiProperty() active: boolean;

  static fromEntity(user: User): UserResponseDto {
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      active: user.active,
    };
  }
}
