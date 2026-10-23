import { ForbiddenException } from '@nestjs/common';
import type { CurrentAccount } from './types.js';

/**
 * A learner may only ever reach their own record. Research staff may reach any, because the
 * researcher view is their job.
 *
 * Called with the learner id from the route, and the account from the session. Never trust a
 * learner id that arrived in a body or a query string on its own.
 */
export function assertCanReachLearner(account: CurrentAccount, learnerId: string): void {
  if (account.kind === 'researcher' || account.kind === 'admin') {
    return;
  }

  if (account.kind === 'learner' && account.learnerId === learnerId) {
    return;
  }

  throw new ForbiddenException('That is not yours to see.');
}

/** The learner the request is acting as, for routes that have no learner id in the path. */
export function requireOwnLearnerId(account: CurrentAccount): string {
  if (account.kind !== 'learner' || !account.learnerId) {
    throw new ForbiddenException('Only a learner can do that.');
  }
  return account.learnerId;
}
