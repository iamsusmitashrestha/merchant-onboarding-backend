import { CallHandler, ExecutionContext } from '@nestjs/common';
import { of } from 'rxjs';
import {
  REQUEST_ID_HEADER,
  RequestIdInterceptor,
} from './request-id.interceptor';

function httpContext(request: { id?: unknown }) {
  const setHeader = jest.fn();
  const context = {
    getType: () => 'http',
    switchToHttp: () => ({
      getRequest: () => request,
      getResponse: () => ({ setHeader }),
    }),
  } as unknown as ExecutionContext;
  return { context, setHeader };
}

const next: CallHandler = { handle: () => of('body') };

describe('RequestIdInterceptor', () => {
  it('echoes the request id in the response header', () => {
    const { context, setHeader } = httpContext({ id: 'req-123' });

    new RequestIdInterceptor().intercept(context, next);

    expect(setHeader).toHaveBeenCalledWith(REQUEST_ID_HEADER, 'req-123');
  });

  it('sets no header when the request has no id', () => {
    const { context, setHeader } = httpContext({});

    new RequestIdInterceptor().intercept(context, next);

    expect(setHeader).not.toHaveBeenCalled();
  });

  it('passes the handler result through unchanged', (done) => {
    const { context } = httpContext({ id: 'req-123' });

    new RequestIdInterceptor().intercept(context, next).subscribe((value) => {
      expect(value).toBe('body');
      done();
    });
  });
});
