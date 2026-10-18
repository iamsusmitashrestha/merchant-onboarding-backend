import { createParamDecorator, ExecutionContext } from '@nestjs/common';

/** The request id that pino-http assigns to every request (or the incoming x-request-id). */
export function requestIdOf(req: { id?: unknown }): string | undefined {
  return typeof req.id === 'string' ? req.id : undefined;
}

/** Controller parameter decorator: `@RequestId() requestId?: string`. */
export const RequestId = createParamDecorator(
  (_data: unknown, ctx: ExecutionContext): string | undefined =>
    requestIdOf(ctx.switchToHttp().getRequest<{ id?: unknown }>()),
);
