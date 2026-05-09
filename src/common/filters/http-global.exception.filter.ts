import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
} from '@nestjs/common';
import { InjectPinoLogger, PinoLogger } from 'nestjs-pino';
import type { Request, Response } from 'express';

@Catch()
export class HttpGlobalExceptionFilter implements ExceptionFilter {
  constructor(
    @InjectPinoLogger(HttpGlobalExceptionFilter.name)
    private readonly log: PinoLogger,
  ) {}

  catch(exception: unknown, host: ArgumentsHost): void {
    if (host.getType() !== 'http') {
      return;
    }

    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const status =
      exception instanceof HttpException
        ? exception.getStatus()
        : HttpStatus.INTERNAL_SERVER_ERROR;

    const body =
      exception instanceof HttpException ? exception.getResponse() : undefined;

    const message =
      typeof body === 'string'
        ? body
        : typeof body === 'object' &&
            body !== null &&
            'message' in body &&
            typeof body.message === 'string'
          ? (body as { message: string }).message
          : exception instanceof Error
            ? exception.message
            : 'internal_error';

    this.log.error(
      {
        err: exception,
        path: request.url,
        method: request.method,
        statusCode: status,
      },
      'http_exception',
    );

    response.status(status).json({
      statusCode: status,
      message,
      path: request.url,
    });
  }
}
