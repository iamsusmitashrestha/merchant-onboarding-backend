import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { compare, hashSync } from 'bcryptjs';
import { randomUUID } from 'crypto';
import { EnvironmentVariables } from '../../config/env.validation';
import { UsersService } from '../users/users.service';
import { LoginResponseDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  /**
   * Compared against when the email is unknown, so "no such user" takes the
   * same time as "wrong password" and response timing doesn't reveal which
   * emails exist.
   */
  private readonly dummyHash = hashSync(randomUUID(), 12);

  constructor(
    private readonly users: UsersService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService<EnvironmentVariables, true>,
  ) {}

  async login(email: string, password: string): Promise<LoginResponseDto> {
    const user = await this.users.findByEmailWithPassword(email);
    const passwordOk = await compare(
      password,
      user?.passwordHash ?? this.dummyHash,
    );

    // Same error for unknown email, wrong password and inactive user.
    if (!user || !passwordOk || !user.active) {
      throw new UnauthorizedException('Invalid credentials');
    }

    const payload: JwtPayload = { sub: user.id, role: user.role };
    return {
      accessToken: await this.jwt.signAsync(payload),
      tokenType: 'Bearer',
      expiresIn: this.config.get('JWT_EXPIRES_IN_SECONDS', { infer: true }),
    };
  }
}
