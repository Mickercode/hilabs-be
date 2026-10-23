import {
  CanActivate,
  type ExecutionContext,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { PrismaService } from '../../prisma/prisma.service.js';
import { hashSessionToken } from './password.js';
import { IS_PUBLIC } from './public.decorator.js';
import type { AccountKind } from './types.js';

export const SESSION_COOKIE = 'hilabs_session';

/**
 * Registered globally, so every route is closed unless it is marked @Public(). A new endpoint
 * added without thinking about access is protected rather than open, which is the way round
 * that fails safely.
 */
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(
    private readonly prisma: PrismaService,
    private readonly reflector: Reflector,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const isPublic = this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [
      context.getHandler(),
      context.getClass(),
    ]);
    if (isPublic) {
      return true;
    }

    const request = context.switchToHttp().getRequest<Request>();
    const token = this.tokenFrom(request);
    if (!token) {
      throw new UnauthorizedException('Sign in to continue.');
    }

    const session = await this.prisma.session.findUnique({
      where: { token_hash: hashSessionToken(token) },
      include: { account: true },
    });

    if (
      !session ||
      session.revoked_at !== null ||
      session.expires_at <= new Date() ||
      session.account.disabled_at !== null
    ) {
      throw new UnauthorizedException('That session is no longer valid.');
    }

    request.account = {
      accountId: session.account.id,
      kind: session.account.kind as AccountKind,
      learnerId: session.account.learner_id,
      email: session.account.email,
    };

    return true;
  }

  private tokenFrom(request: Request): string | undefined {
    const cookie = (request.cookies as Record<string, string> | undefined)?.[SESSION_COOKIE];
    if (cookie) {
      return cookie;
    }

    // Bearer is accepted so the API can be exercised from a terminal or a test without a
    // cookie jar. The browser always uses the cookie, which JavaScript cannot read.
    const header = request.headers.authorization;
    return header?.startsWith('Bearer ') ? header.slice(7) : undefined;
  }
}
