export type AccountKind = 'learner' | 'researcher' | 'rater' | 'admin';

/** Who is making the request. Attached by SessionGuard, never taken from the body or a param. */
export interface CurrentAccount {
  accountId: string;
  kind: AccountKind;
  /** Present only for a learner account. */
  learnerId: string | null;
  email: string;
}

declare module 'express' {
  interface Request {
    account?: CurrentAccount;
  }
}
