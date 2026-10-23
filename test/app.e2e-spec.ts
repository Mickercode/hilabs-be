import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { hashPassword } from './../src/common/auth/password.js';
import { PrismaService } from './../src/prisma/prisma.service.js';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

/**
 * Needs a live database, so it runs in the CI job that has one.
 *
 * Most of what is asserted here is access control. The API holds people's own writing and their
 * reflections, and most of it was reachable by anyone holding a UUID before this suite existed.
 */
describe('HiLabs API (e2e)', () => {
  let app: INestApplication<Server>;
  let server: Server;
  let prisma: PrismaService;
  let staffEmail: string;

  const unique = () => `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

  const signUp = async (overrides: Record<string, unknown> = {}) => {
    const email = `learner-${unique()}@example.org`;
    const agent = request.agent(server);
    const res = await agent.post('/api/v1/auth/sign-up').send({
      email,
      password: 'a-long-enough-passphrase',
      goal: 'Why do fixes at work so often make things worse?',
      consentLevel: 'research_full',
      consentDocumentVersion: 'consent-v1',
      ...overrides,
    });
    return { agent, email, res };
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The same configuration the server uses, so the tests cannot drift from production.
    configureApp(app, { webOrigin: 'http://localhost:3001' });
    await app.init();
    server = app.getHttpServer();
    prisma = app.get(PrismaService);

    // A staff account, created the way the CLI creates one: no endpoint grants this.
    staffEmail = `researcher-${unique()}@example.org`;
    const staff = await prisma.account.create({
      data: { kind: 'researcher', email: staffEmail, display_name: 'Test Researcher' },
    });
    await prisma.credential.create({
      data: {
        account_id: staff.id,
        type: 'password',
        secret_hash: await hashPassword('a-long-enough-passphrase'),
      },
    });
  });

  afterAll(async () => {
    await app?.close();
  });

  describe('health', () => {
    it('is public and reports the database as up', async () => {
      const res = await request(server).get('/api/v1/health').expect(200);
      expect(res.body.status).toBe('ok');
      expect(res.body.info.database.status).toBe('up');
    });
  });

  describe('everything else is closed by default', () => {
    it.each([
      ['get', '/api/v1/learners/11111111-1111-1111-1111-111111111111'],
      ['get', '/api/v1/learners/11111111-1111-1111-1111-111111111111/export'],
      ['get', '/api/v1/discovery/challenges'],
      ['get', '/api/v1/library/resources'],
      ['get', '/api/v1/research/rating-progress'],
      ['get', '/api/v1/research/hypotheses/current'],
      ['get', '/api/v1/auth/me'],
    ])('refuses %s %s without a session', async (method, path) => {
      await request(server)[method as 'get'](path).expect(401);
    });
  });

  describe('signing up', () => {
    it('creates the account, the learner and the consent record together', async () => {
      const { agent, email, res } = await signUp();
      expect(res.status).toBe(201);
      expect(res.body.account.kind).toBe('learner');
      expect(res.body.account.email).toBe(email);
      expect(res.body.account.learnerId).toMatch(/^[0-9a-f-]{36}$/);

      const me = await agent.get('/api/v1/auth/me').expect(200);
      expect(me.body.accountId).toBe(res.body.account.accountId);

      const exported = await agent
        .get(`/api/v1/learners/${res.body.account.learnerId}/export`)
        .expect(200);
      expect(exported.body.consent).toHaveLength(1);
      expect(exported.body.learner.goal).toContain('fixes at work');
    });

    it('does not put the learner in the study: the arm is assigned after the baseline task', async () => {
      const { agent, res } = await signUp();
      const learner = await agent
        .get(`/api/v1/learners/${res.body.account.learnerId}`)
        .expect(200);
      expect(learner.body.study_arm).toBeNull();
    });

    it('refuses a goal shorter than a sentence', async () => {
      const { res } = await signUp({ goal: 'x' });
      expect(res.status).toBe(400);
    });

    it('refuses a field onboarding must never collect (R2)', async () => {
      const { res } = await signUp({ university: 'Somewhere' });
      expect(res.status).toBe(400);
    });

    it('refuses a second account on the same address', async () => {
      const { email } = await signUp();
      const again = await request(server).post('/api/v1/auth/sign-up').send({
        email: email.toUpperCase(),
        password: 'a-long-enough-passphrase',
        goal: 'Something else entirely that is long enough',
        consentLevel: 'research_full',
        consentDocumentVersion: 'consent-v1',
      });
      expect(again.status).toBe(409);
    });
  });

  describe('one learner cannot reach another', () => {
    it('refuses to export someone else', async () => {
      const first = await signUp();
      const second = await signUp();

      await second.agent
        .get(`/api/v1/learners/${first.res.body.account.learnerId}/export`)
        .expect(403);
    });

    it('refuses the researcher view to a learner', async () => {
      const { agent } = await signUp();
      await agent.get('/api/v1/research/rating-progress').expect(403);
      await agent.get('/api/v1/research/hypotheses/current').expect(403);
    });

    it('allows the researcher view to a researcher, so it is not simply over-locked', async () => {
      const agent = request.agent(server);
      await agent
        .post('/api/v1/auth/sign-in')
        .send({ email: staffEmail, password: 'a-long-enough-passphrase' })
        .expect(200);

      await agent.get('/api/v1/research/rating-progress').expect(200);
      await agent.get('/api/v1/research/hypotheses/missing-evidence').expect(200);
    });

    it('a researcher has no learner record of their own', async () => {
      const agent = request.agent(server);
      const signedIn = await agent
        .post('/api/v1/auth/sign-in')
        .send({ email: staffEmail, password: 'a-long-enough-passphrase' })
        .expect(200);

      expect(signedIn.body.account.kind).toBe('researcher');
      expect(signedIn.body.account.learnerId).toBeNull();
    });
  });

  describe('the task catalogue', () => {
    it('offers six Discovery challenges, one in each kind of thinking', async () => {
      const { agent } = await signUp();
      const res = await agent.get('/api/v1/discovery/challenges').expect(200);

      const required = (res.body as Array<{ tier: number; code: string; gim_domain: string }>)
        .filter((task) => task.tier === 0);

      expect(required).toHaveLength(6);
      expect(required.map((t) => t.code).sort()).toEqual(['D1', 'D2', 'D3', 'D4', 'D5', 'D6']);

      // Section 5.2 asks Discovery to expose a learner to all six domains. A gap is not a
      // cosmetic problem: the pilot would not be doing what it says it does.
      expect(new Set(required.map((t) => t.gim_domain))).toEqual(
        new Set(['cognitive', 'analytical', 'creative', 'emotional', 'adaptive', 'instinctive']),
      );
    });

    it('carries optional extensions beyond the required attempt', async () => {
      const { agent } = await signUp();
      const res = await agent.get('/api/v1/discovery/challenges').expect(200);

      const extensions = (res.body as Array<{ tier: number }>).filter((task) => task.tier > 0);
      expect(extensions.length).toBeGreaterThan(0);
    });

    it('gives every task a body a learner could actually answer', async () => {
      const { agent } = await signUp();
      const res = await agent.get('/api/v1/discovery/challenges').expect(200);

      for (const task of res.body as Array<{ title: string; body: string }>) {
        expect(task.title.length).toBeGreaterThan(0);
        expect(task.body.length).toBeGreaterThan(20);
      }
    });
  });

  describe('signing in and out', () => {
    it('signs in with the password that was set, and not with another', async () => {
      const { email } = await signUp();

      await request(server)
        .post('/api/v1/auth/sign-in')
        .send({ email, password: 'not-the-right-passphrase' })
        .expect(401);

      await request(server)
        .post('/api/v1/auth/sign-in')
        .send({ email, password: 'a-long-enough-passphrase' })
        .expect(200);
    });

    it('gives the same answer for an unknown address as for a wrong password', async () => {
      await request(server)
        .post('/api/v1/auth/sign-in')
        .send({ email: `nobody-${unique()}@example.org`, password: 'a-long-enough-passphrase' })
        .expect(401);
    });

    it('revokes the session on sign-out', async () => {
      const { agent } = await signUp();
      await agent.get('/api/v1/auth/me').expect(200);
      await agent.post('/api/v1/auth/sign-out').expect(204);
      await agent.get('/api/v1/auth/me').expect(401);
    });
  });
});
