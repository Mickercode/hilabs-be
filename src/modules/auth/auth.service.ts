import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { hashPassword, issueSessionToken, hashSessionToken, verifyPassword } from '../../common/auth/password.js';
import type { AccountKind, CurrentAccount } from '../../common/auth/types.js';
import { PrismaService } from '../../prisma/prisma.service.js';
import { SignInDto } from './dto/sign-in.dto.js';
import { SignUpDto } from './dto/sign-up.dto.js';

/** A pilot runs four weeks plus a retention task about three weeks later. */
const SESSION_DAYS = 60;

export interface SignedIn {
  token: string;
  expiresAt: Date;
  account: CurrentAccount;
}

@Injectable()
export class AuthService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Creates the account, the learner, the password and the consent record in one transaction.
   *
   * People create their own account and set their own password, so the team never holds anyone's
   * credentials, and the consent on file is the learner's own act rather than something recorded
   * on their behalf.
   *
   * Signing up is not the same as joining the study. `study_arm` stays null until randomisation,
   * which happens after the baseline task because assignment is balanced on that score.
   */
  async signUp(dto: SignUpDto): Promise<SignedIn> {
    const email = normaliseEmail(dto.email);

    if (await this.prisma.account.findFirst({ where: { email } })) {
      throw new ConflictException('There is already an account with that email address.');
    }

    const secretHash = await hashPassword(dto.password);
    const { token, tokenHash } = issueSessionToken();
    const expiresAt = sessionExpiry();

    const account = await this.prisma.$transaction(async (tx) => {
      const learner = await tx.learner.create({
        data: {
          goal: dto.goal,
          prior_health_care_experience: dto.priorHealthCareExperience ?? null,
        },
      });

      const created = await tx.account.create({
        data: {
          kind: 'learner',
          email,
          display_name: dto.displayName ?? null,
          learner_id: learner.id,
        },
      });

      await tx.credential.create({
        data: { account_id: created.id, type: 'password', secret_hash: secretHash },
      });

      await tx.consent_event.create({
        data: {
          learner_id: learner.id,
          level: dto.consentLevel,
          document_version: dto.consentDocumentVersion,
        },
      });

      await tx.session.create({
        data: { account_id: created.id, token_hash: tokenHash, expires_at: expiresAt },
      });

      return created;
    });

    return { token, expiresAt, account: toCurrentAccount(account) };
  }

  async signIn(dto: SignInDto): Promise<SignedIn> {
    const email = normaliseEmail(dto.email);
    const account = await this.prisma.account.findFirst({
      where: { email },
      include: { credential: { where: { type: 'password' }, orderBy: { created_at: 'desc' }, take: 1 } },
    });

    const stored = account?.credential[0]?.secret_hash;
    // Verify against a dummy hash when the account is unknown, so a missing account and a wrong
    // password take the same time and the endpoint does not tell an attacker which it was.
    const ok = await verifyPassword(dto.password, stored ?? DUMMY_HASH);

    if (!account || !ok || account.disabled_at !== null) {
      throw new UnauthorizedException('That email address and password do not match.');
    }

    const { token, tokenHash } = issueSessionToken();
    const expiresAt = sessionExpiry();

    await this.prisma.session.create({
      data: { account_id: account.id, token_hash: tokenHash, expires_at: expiresAt },
    });

    return { token, expiresAt, account: toCurrentAccount(account) };
  }

  /** Revokes rather than deletes, so the sign-out is itself on the record. */
  async signOut(token: string | undefined): Promise<void> {
    if (!token) {
      return;
    }

    await this.prisma.session.updateMany({
      where: { token_hash: hashSessionToken(token), revoked_at: null },
      data: { revoked_at: new Date() },
    });
  }
}

/**
 * A real scrypt hash of a value nobody will guess, used only to spend the same time on an
 * unknown account as on a known one.
 */
const DUMMY_HASH =
  'scrypt$16384$8$1$AAAAAAAAAAAAAAAAAAAAAA$' +
  'ZHVtbXktdmFsdWUtdGhhdC13aWxsLW5ldmVyLW1hdGNoLWFueXRoaW5nLWF0LWFsbC1oZXJl';

function normaliseEmail(email: string): string {
  return email.trim().toLowerCase();
}

function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

function toCurrentAccount(account: {
  id: string;
  kind: string;
  learner_id: string | null;
  email: string;
}): CurrentAccount {
  return {
    accountId: account.id,
    kind: account.kind as AccountKind,
    learnerId: account.learner_id,
    email: account.email,
  };
}
