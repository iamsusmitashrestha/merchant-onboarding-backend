import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { ExtractJwt, Strategy } from 'passport-jwt';
import { AuthUser } from './auth.decorators';
import { requestIdOf } from '../../common/request-id';
import { EnvironmentVariables } from '../../config/env.validation';
import { UserRole } from '../users/user-role.enum';
import { UsersService } from '../users/users.service';

export interface JwtPayload {
  sub: string;
  role: UserRole;
}

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    config: ConfigService<EnvironmentVariables, true>,
    private readonly users: UsersService,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: config.get('JWT_SECRET', { infer: true }),
      algorithms: ['HS256'], // rejects alg=none and algorithm-confusion tokens
      ignoreExpiration: false,
      passReqToCallback: true, // so the request id can travel with the user
    });
  }

  /**
   * The user is re-loaded on every request: a deactivated user is locked out
   * immediately, and the role comes from the DB rather than a possibly stale token.
   */
  async validate(
    req: { id?: unknown },
    payload: JwtPayload,
  ): Promise<AuthUser> {
    const user = await this.users.findById(payload.sub);
    if (!user || !user.active) {
      throw new UnauthorizedException();
    }
    return {
      id: user.id,
      email: user.email,
      role: user.role,
      requestId: requestIdOf(req),
    };
  }
}
