import {
  Body,
  Controller,
  Get,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import {
  ApiBadRequestResponse,
  ApiBearerAuth,
  ApiConflictResponse,
  ApiCreatedResponse,
  ApiForbiddenResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import type { AuthUser } from '../auth/auth.decorators';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { UserRole } from '../users/user-role.enum';
import { ApplicationsService } from './applications.service';
import {
  ApplicationPageDto,
  ApplicationResponseDto,
} from './dto/application-response.dto';
import { AssignReviewerDto } from './dto/assign-reviewer.dto';
import { CreateApplicationDto } from './dto/create-application.dto';
import { ListApplicationsQueryDto } from './dto/list-applications-query.dto';
import { RecordDecisionDto } from './dto/record-decision.dto';
import { UpdateApplicationDto } from './dto/update-application.dto';

@ApiTags('applications')
@ApiBearerAuth()
@ApiUnauthorizedResponse({ description: 'Missing, invalid or expired token' })
@Controller('applications')
export class ApplicationsController {
  constructor(private readonly applications: ApplicationsService) {}

  @Post()
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @ApiCreatedResponse({ type: ApplicationResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Role not allowed' })
  async create(
    @CurrentUser() user: AuthUser,
    @Body() dto: CreateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const app = await this.applications.create(user, dto);
    return ApplicationResponseDto.fromEntity(app);
  }

  @Get()
  @ApiOkResponse({ type: ApplicationPageDto })
  @ApiBadRequestResponse({ description: 'Invalid filter or pagination' })
  async list(
    @CurrentUser() user: AuthUser,
    @Query() query: ListApplicationsQueryDto,
  ): Promise<ApplicationPageDto> {
    const { items, total } = await this.applications.list(user, query);
    return {
      data: items.map((app) => ApplicationResponseDto.fromEntity(app)),
      meta: { page: query.page, limit: query.limit, total },
    };
  }

  @Get(':id')
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiNotFoundResponse({ description: 'Not found or not visible to you' })
  async findOne(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
  ): Promise<ApplicationResponseDto> {
    const app = await this.applications.findOne(user, id);
    return ApplicationResponseDto.fromEntity(app);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN, UserRole.SALES)
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({ description: 'Role not allowed' })
  @ApiNotFoundResponse({ description: 'Not found or not visible to you' })
  @ApiConflictResponse({
    description: 'Not editable in its current status, or stale expectedVersion',
  })
  async update(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: UpdateApplicationDto,
  ): Promise<ApplicationResponseDto> {
    const app = await this.applications.update(user, id, dto);
    return ApplicationResponseDto.fromEntity(app);
  }

  @Post(':id/assign')
  @HttpCode(200)
  @Roles(UserRole.ADMIN)
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiBadRequestResponse({
    description: 'reviewerId is not an active REVIEWER',
  })
  @ApiForbiddenResponse({ description: 'Only ADMIN can assign' })
  @ApiNotFoundResponse({ description: 'Application not found' })
  @ApiConflictResponse({ description: 'Not assignable in its current status' })
  async assign(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: AssignReviewerDto,
  ): Promise<ApplicationResponseDto> {
    const app = await this.applications.assign(user, id, dto);
    return ApplicationResponseDto.fromEntity(app);
  }

  @Post(':id/decision')
  @HttpCode(200)
  @Roles(UserRole.REVIEWER)
  @ApiOkResponse({ type: ApplicationResponseDto })
  @ApiBadRequestResponse({ description: 'Validation failed' })
  @ApiForbiddenResponse({
    description: 'Only the assigned REVIEWER can record a decision',
  })
  @ApiNotFoundResponse({ description: 'Not found or not visible to you' })
  @ApiConflictResponse({ description: 'Not IN_REVIEW' })
  async decide(
    @CurrentUser() user: AuthUser,
    @Param('id', ParseUUIDPipe) id: string,
    @Body() dto: RecordDecisionDto,
  ): Promise<ApplicationResponseDto> {
    const app = await this.applications.decide(user, id, dto);
    return ApplicationResponseDto.fromEntity(app);
  }
}
