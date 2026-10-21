import {
  ExceptionFilter,
  Catch,
  ArgumentsHost,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Request, Response } from 'express';

/** Maps known Prisma request errors to client-safe HTTP responses. */
function mapPrismaError(exception: Prisma.PrismaClientKnownRequestError): { status: number; error: string; message: string } | null {
  switch (exception.code) {
    case 'P2002': {
      const target = (exception.meta?.target as string[] | string | undefined) ?? [];
      const fields = (Array.isArray(target) ? target : [target]).filter((f) => f !== 'tenantId');
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: fields.length
          ? `A record with the same ${fields.join(', ')} already exists.`
          : 'A record with the same unique value already exists.',
      };
    }
    case 'P2025':
      return { status: HttpStatus.NOT_FOUND, error: 'Not Found', message: 'The requested record was not found.' };
    case 'P2003':
      return {
        status: HttpStatus.CONFLICT,
        error: 'Conflict',
        message: 'This operation conflicts with related records (a referenced record is missing or still in use).',
      };
    default:
      return null;
  }
}

@Catch()
export class GlobalHttpExceptionFilter implements ExceptionFilter {
  private readonly logger = new Logger(GlobalHttpExceptionFilter.name);

  catch(exception: unknown, host: ArgumentsHost) {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message: any = 'Internal server error occurred';
    let error = 'Internal Server Error';
    // Structured detail a client can act on (e.g. per-row import validation errors)
    let details: unknown;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const res = exception.getResponse();
      if (typeof res === 'object' && res !== null) {
        message = (res as any).message || (res as any).error || message;
        error = (res as any).error || exception.name;
        if (Array.isArray((res as any).errors)) details = (res as any).errors;
      } else {
        message = res;
        error = exception.name;
      }
    } else if (exception instanceof Prisma.PrismaClientKnownRequestError && mapPrismaError(exception)) {
      ({ status, error, message } = mapPrismaError(exception));
    } else if (exception instanceof Prisma.PrismaClientValidationError) {
      status = HttpStatus.BAD_REQUEST;
      error = 'Bad Request';
      message = 'The request contains invalid or incompatible field values.';
    }
    // Any other error keeps the generic 500 message: internal details are logged, never returned to the client.

    const logLine = `[${request.method}] ${request.url} - Status: ${status} - Error: ${JSON.stringify(message)}`;
    if (status >= 500) {
      this.logger.error(logLine, exception instanceof Error ? exception.stack : undefined);
    } else {
      this.logger.warn(logLine);
    }

    response.status(status).json({
      success: false,
      statusCode: status,
      error,
      message,
      ...(details !== undefined ? { errors: details } : {}),
      timestamp: new Date().toISOString(),
      path: request.url,
    });
  }
}
