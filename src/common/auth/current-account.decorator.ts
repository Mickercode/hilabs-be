import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { Request } from 'express';
import type { CurrentAccount } from './types.js';

export const Account = createParamDecorator(
  (_data: unknown, context: ExecutionContext): CurrentAccount => {
    const request = context.switchToHttp().getRequest<Request>();
    if (!request.account) {
      throw new Error('No account on the request. Is SessionGuard registered?');
    }
    return request.account;
  },
);
