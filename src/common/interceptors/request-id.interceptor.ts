import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { requestIdOf } from '../request-id';

export const REQUEST_ID_HEADER = 'x-request-id';

// Echoes the request id so a client can quote it when reporting a problem; it
// matches the logs and the audit rows. Errors get the header from the exception
// filter instead, because guards (401/403/429) run before interceptors.
@Injectable()
export class RequestIdInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    if (context.getType() === 'http') {
      const http = context.switchToHttp();
      const requestId = requestIdOf(http.getRequest<{ id?: unknown }>());
      if (requestId) {
        http
          .getResponse<{ setHeader(name: string, value: string): void }>()
          .setHeader(REQUEST_ID_HEADER, requestId);
      }
    }
    return next.handle();
  }
}
