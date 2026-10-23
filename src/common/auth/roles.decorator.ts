import { SetMetadata } from '@nestjs/common';
import type { AccountKind } from './types.js';

export const ROLES = 'hilabs:roles';

export const Roles = (...kinds: AccountKind[]) => SetMetadata(ROLES, kinds);
