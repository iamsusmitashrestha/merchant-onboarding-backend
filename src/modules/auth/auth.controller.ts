import { Body, Controller, HttpCode, Post, UseGuards } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiTooManyRequestsResponse,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequestId } from '../../common/request-id';
import { Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { LoginThrottlerGuard } from './login-throttler.guard';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @UseGuards(LoginThrottlerGuard)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiTooManyRequestsResponse({
    description:
      'Too many attempts for this email from this client; retry after the window',
  })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(
    @Body() dto: LoginDto,
    @RequestId() requestId?: string,
  ): Promise<LoginResponseDto> {
    return this.auth.login(dto.email, dto.password, requestId);
  }
}
