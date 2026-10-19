import { Controller, Get, Query } from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiForbiddenResponse,
  ApiOkResponse,
  ApiTags,
} from '@nestjs/swagger';
import { Roles } from '../auth/auth.decorators';
import { ListUsersQueryDto } from './dto/list-users-query.dto';
import { UserResponseDto } from './dto/user-response.dto';
import { UserRole } from './user-role.enum';
import { UsersService } from './users.service';

@ApiTags('users')
@ApiBearerAuth()
@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  // Lets an ADMIN find reviewer ids for assignment, e.g. ?role=REVIEWER.
  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: [UserResponseDto] })
  @ApiForbiddenResponse({ description: 'Only ADMIN can list users' })
  async list(@Query() query: ListUsersQueryDto): Promise<UserResponseDto[]> {
    const users = await this.users.list(query.role);
    return users.map((user) => UserResponseDto.fromEntity(user));
  }
}
