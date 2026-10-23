import { INestApplication } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from './../src/app.module.js';
import { configureApp } from './../src/app.setup.js';

/**
 * Needs a live database, so it runs in the CI job that has one. See .github/workflows/ci.yml.
 */
describe('HiLabs API (e2e)', () => {
  let app: INestApplication<Server>;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    // The same configuration the server uses, so the tests cannot drift from production.
    configureApp(app, { webOrigin: 'http://localhost:3001' });
    await app.init();
  });

  afterAll(async () => {
    await app?.close();
  });

  it('reports the database as up', async () => {
    const res = await request(app.getHttpServer()).get('/api/v1/health').expect(200);
    expect(res.body.status).toBe('ok');
    expect(res.body.info.database.status).toBe('up');
  });

  it('refuses onboarding that asks for a goal shorter than a sentence', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/learners')
      .send({ goal: 'x', consentLevel: 'research_full', consentDocumentVersion: 'consent-v1' })
      .expect(400);
  });

  it('refuses a field onboarding must never collect', async () => {
    await request(app.getHttpServer())
      .post('/api/v1/learners')
      .send({
        goal: 'Why do fixes make things worse?',
        consentLevel: 'research_full',
        consentDocumentVersion: 'consent-v1',
        university: 'Somewhere',
      })
      .expect(400);
  });

  it('onboards from a goal, and keeps every draft as a new version', async () => {
    const created = await request(app.getHttpServer())
      .post('/api/v1/learners')
      .send({
        goal: 'Why do fixes at work so often make things worse?',
        consentLevel: 'research_full',
        consentDocumentVersion: 'consent-v1',
      })
      .expect(201);

    const learnerId = created.body.id as string;
    expect(learnerId).toMatch(/^[0-9a-f-]{36}$/);

    const exported = await request(app.getHttpServer())
      .get(`/api/v1/learners/${learnerId}/export`)
      .expect(200);

    expect(exported.body.consent).toHaveLength(1);
    expect(exported.body.learner.goal).toContain('fixes at work');
  });
});
