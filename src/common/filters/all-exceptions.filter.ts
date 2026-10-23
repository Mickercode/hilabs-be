import {
  ArgumentsHost,
  Catch,
  ExceptionFilter,
  HttpException,
  HttpStatus,
  Logger,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Request, Response } from 'express';

interface ErrorBody {
  statusCode: number;
  error: string;
  message: string | string[];
  path: string;
  timestamp: string;
}

/**
 * One error shape for the whole API, and nothing leaks a stack trace or a learner's content to
 * the client. Database constraint violations are translated rather than passed through: several
 * of them are the research invariants firing, and the message should say so.
 */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  private readonly logger = new Logger(AllExceptionsFilter.name);

  catch(exception: unknown, host: ArgumentsHost): void {
    const ctx = host.switchToHttp();
    const response = ctx.getResponse<Response>();
    const request = ctx.getRequest<Request>();

    const { status, error, message } = this.describe(exception);

    if (status >= HttpStatus.INTERNAL_SERVER_ERROR) {
      this.logger.error(`${request.method} ${request.url}`, this.stackOf(exception));
    } else {
      this.logger.warn(`${request.method} ${request.url} -> ${status} ${JSON.stringify(message)}`);
    }

    const body: ErrorBody = {
      statusCode: status,
      error,
      message,
      path: request.url,
      timestamp: new Date().toISOString(),
    };

    response.status(status).json(body);
  }

  private describe(exception: unknown): {
    status: number;
    error: string;
    message: string | string[];
  } {
    if (exception instanceof HttpException) {
      const payload = exception.getResponse();
      const message =
        typeof payload === 'string'
          ? payload
          : ((payload as { message?: string | string[] }).message ?? exception.message);
      return { status: exception.getStatus(), error: exception.name, message };
    }

    if (exception instanceof Prisma.PrismaClientKnownRequestError) {
      return this.describePrisma(exception);
    }

    return {
      status: HttpStatus.INTERNAL_SERVER_ERROR,
      error: 'InternalServerError',
      message: 'Something went wrong.',
    };
  }

  private describePrisma(exception: Prisma.PrismaClientKnownRequestError): {
    status: number;
    error: string;
    message: string;
  } {
    switch (exception.code) {
      case 'P2002':
        return {
          status: HttpStatus.CONFLICT,
          error: 'Conflict',
          message: 'That record already exists.',
        };
      case 'P2025':
        return {
          status: HttpStatus.NOT_FOUND,
          error: 'NotFound',
          message: 'That record does not exist.',
        };
      case 'P2003':
        return {
          status: HttpStatus.BAD_REQUEST,
          error: 'BadRequest',
          message: 'That record refers to something that does not exist.',
        };
      default:
        // A trigger or CHECK refusing a write is usually one of the research invariants:
        // an attempt to update an observation, to delete without an authorised erasure, or to
        // write a companion explanation with no cited resource.
        return {
          status: HttpStatus.UNPROCESSABLE_ENTITY,
          error: 'UnprocessableEntity',
          message: 'The database refused that write. It may break a research invariant.',
        };
    }
  }

  private stackOf(exception: unknown): string | undefined {
    return exception instanceof Error ? exception.stack : undefined;
  }
}
