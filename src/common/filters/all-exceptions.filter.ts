import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import {
  ConflictError,
  DomainError,
  ForbiddenActionError,
  InvalidRequestError,
  InvalidTransitionError,
  NotFoundError,
  ServiceUnavailableError,
} from '../errors';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
  requestId?: string;
}

/**
 * One consistent error shape for every failure. Unknown errors become a
 * generic 500 — stack traces, SQL and entity data never reach the client.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const req = ctx.getRequest<Request & { id?: string }>();
    const res = ctx.getResponse<Response>();

    const { status, message } = this.resolve(exception);
    if (status >= 500) {
      this.logger.error(
        exception instanceof Error ? exception.stack : exception,
      );
    }

    const body: ErrorBody = {
      statusCode: status,
      error: HttpStatus[status] ?? 'Error',
      message,
      path: req.url,
      timestamp: new Date().toISOString(),
      requestId: req.id,
    };
    res.status(status).json(body);
  }

  private resolve(exception: unknown): {
    status: number;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const response = exception.getResponse();
      const message =
        typeof response === 'object' &&
        response !== null &&
        'message' in response
          ? (response as { message: string | string[] }).message
          : exception.message;
      return { status: exception.getStatus(), message };
    }
    if (exception instanceof DomainError) {
      return { status: domainStatus(exception), message: exception.message };
    }
    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      message: 'Internal server error',
    };
  }
}

function domainStatus(error: DomainError): number {
  if (error instanceof NotFoundError) return HttpStatus.NOT_FOUND;
  if (error instanceof ForbiddenActionError) return HttpStatus.FORBIDDEN;
  if (error instanceof InvalidTransitionError) return HttpStatus.CONFLICT;
  if (error instanceof ConflictError) return HttpStatus.CONFLICT;
  if (error instanceof InvalidRequestError) return HttpStatus.BAD_REQUEST;
  if (error instanceof ServiceUnavailableError) {
    return HttpStatus.SERVICE_UNAVAILABLE;
  }
  return HttpStatus.BAD_REQUEST;
}
