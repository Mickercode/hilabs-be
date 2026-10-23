import { Body, Controller, Get, HttpCode, HttpStatus, Post, Req, Res } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { CookieOptions, Request, Response } from 'express';
import { Account } from '../../common/auth/current-account.decorator.js';
import { Public } from '../../common/auth/public.decorator.js';
import { SESSION_COOKIE } from '../../common/auth/session.guard.js';
import type { CurrentAccount } from '../../common/auth/types.js';
import { AuthService, type SignedIn } from './auth.service.js';
import { SignInDto } from './dto/sign-in.dto.js';
import { SignUpDto } from './dto/sign-up.dto.js';

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly auth: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('sign-up')
  @ApiOperation({
    summary: 'Create an account and start a journey',
    description:
      'One step: the account, the goal and the consent record are written together. Signing up ' +
      'is not the same as joining the study; the arm is assigned later, after the baseline task.',
  })
  async signUp(
    @Body() dto: SignUpDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ account: CurrentAccount }> {
    const result = await this.auth.signUp(dto);
    this.setCookie(response, result);
    return { account: result.account };
  }

  @Public()
  @Post('sign-in')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Sign in' })
  async signIn(
    @Body() dto: SignInDto,
    @Res({ passthrough: true }) response: Response,
  ): Promise<{ account: CurrentAccount }> {
    const result = await this.auth.signIn(dto);
    this.setCookie(response, result);
    return { account: result.account };
  }

  @Post('sign-out')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Sign out, revoking this session' })
  async signOut(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    const cookies = request.cookies as Record<string, string> | undefined;
    await this.auth.signOut(cookies?.[SESSION_COOKIE]);
    response.clearCookie(SESSION_COOKIE, this.cookieOptions());
  }

  @Get('me')
  @ApiOperation({ summary: 'Who this session belongs to' })
  me(@Account() account: CurrentAccount): CurrentAccount {
    return account;
  }

  private setCookie(response: Response, result: SignedIn): void {
    response.cookie(SESSION_COOKIE, result.token, {
      ...this.cookieOptions(),
      expires: result.expiresAt,
    });
  }

  private cookieOptions(): CookieOptions {
    return {
      // JavaScript cannot read it, so a cross-site script cannot steal the session.
      httpOnly: true,
      secure: this.config.getOrThrow<string>('app.nodeEnv') === 'production',
      sameSite: 'lax',
      path: '/',
    };
  }
}
