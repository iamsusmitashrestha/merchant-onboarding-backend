import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import {
  ApiOkResponse,
  ApiTags,
  ApiUnauthorizedResponse,
} from '@nestjs/swagger';
import { RequestId } from '../../common/request-id';
import { Public } from './auth.decorators';
import { AuthService } from './auth.service';
import { LoginDto, LoginResponseDto } from './dto/login.dto';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOkResponse({ type: LoginResponseDto })
  @ApiUnauthorizedResponse({ description: 'Invalid credentials' })
  login(
    @Body() dto: LoginDto,
    @RequestId() requestId?: string,
  ): Promise<LoginResponseDto> {
    return this.auth.login(dto.email, dto.password, requestId);
  }
}
