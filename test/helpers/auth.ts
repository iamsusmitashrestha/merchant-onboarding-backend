import { JwtService } from '@nestjs/jwt';
import { Server } from 'http';
import request from 'supertest';
import { UserRole } from '../../src/modules/users/user-role.enum';
import { testPassword } from './test-app';

export async function loginAs(http: Server, email: string): Promise<string> {
  const res = await request(http)
    .post('/auth/login')
    .send({ email, password: testPassword() })
    .expect(200);
  return (res.body as { accessToken: string }).accessToken;
}

export const bearer = (token: string) => ({ Authorization: `Bearer ${token}` });

// Only for negative tests (expired, wrong secret, forged role).
export function signToken(
  payload: { sub: string; role: UserRole; exp?: number },
  secret = process.env.JWT_SECRET ?? '',
): string {
  return new JwtService({ secret }).sign(payload, { algorithm: 'HS256' });
}

export function unsignedToken(payload: {
  sub: string;
  role: UserRole;
}): string {
  const encode = (value: object) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'none', typ: 'JWT' })}.${encode(payload)}.`;
}
