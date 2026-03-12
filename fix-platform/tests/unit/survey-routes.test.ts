/**
 * Unit tests for Survey CRUD API routes.
 *
 * Uses vi.mock to mock Prisma so no database is needed.
 * Tests cover: list (with ?active filter), detail with questions, create with questions,
 * update (fields + questions), delete (cascade), respond (upsert), list responses, aggregated results.
 *
 * Auth model:
 *   - Any authenticated user: GET /, GET /:id, POST /:id/respond
 *   - EDITOR+: POST /, PUT /:id, DELETE /:id, GET /:id/responses, GET /:id/results
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import request from 'supertest';
import express from 'express';
import session from 'express-session';
import { errorHandler } from '../../server/middleware/errorHandler.js';

// Mock Prisma before importing routes
vi.mock('../../server/db.js', () => ({
  default: {
    survey: {
      findMany: vi.fn(),
      findUnique: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      delete: vi.fn(),
    },
    surveyQuestion: {
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    surveyResponse: {
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      deleteMany: vi.fn(),
    },
    platformUser: {
      findUnique: vi.fn(),
    },
  },
}));

import prisma from '../../server/db.js';
import surveysRouter from '../../server/routes/platform/surveys.js';

// Type helpers for mocked functions
const mockPrisma = prisma as {
  survey: {
    findMany: ReturnType<typeof vi.fn>;
    findUnique: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    delete: ReturnType<typeof vi.fn>;
  };
  surveyQuestion: {
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
  surveyResponse: {
    findMany: ReturnType<typeof vi.fn>;
    findFirst: ReturnType<typeof vi.fn>;
    create: ReturnType<typeof vi.fn>;
    update: ReturnType<typeof vi.fn>;
    deleteMany: ReturnType<typeof vi.fn>;
  };
};

/** Build a minimal Express app for testing. Sets a session user based on role. */
function buildApp(role: 'ADMIN' | 'EDITOR' | 'VIEWER' | null = 'ADMIN', userId = 1) {
  const app = express();
  app.use(express.json());
  app.use(
    session({
      secret: 'test-secret',
      resave: false,
      saveUninitialized: true,
    })
  );

  if (role !== null) {
    app.use((_req, _res, next) => {
      (_req as any).session.user = { id: userId, username: 'testuser', role };
      next();
    });
    // Mock platformUser lookup for platformProtectStrict
    (prisma as any).platformUser.findUnique.mockResolvedValue({
      id: `platform-user-${userId}`,
      userId,
      role: 'RESIDENT',
      active: true,
    });
  } else {
    (prisma as any).platformUser.findUnique.mockResolvedValue(null);
  }

  app.use('/api/platform/surveys', surveysRouter);
  app.use(errorHandler);
  return app;
}

/** Example survey returned by Prisma */
const exampleSurvey = {
  id: 'survey-uuid-1',
  title: 'Resident Satisfaction Survey',
  description: 'Annual satisfaction survey',
  status: 'ACTIVE',
  active: true,
  startsAt: null,
  endsAt: null,
  createdBy: 'user-uuid-1',
  createdAt: new Date('2025-01-01').toISOString(),
  updatedAt: new Date('2025-01-01').toISOString(),
  questions: [],
  _count: { questions: 0, responses: 0 },
};

/** Example survey question */
const exampleQuestion = {
  id: 'question-uuid-1',
  surveyId: 'survey-uuid-1',
  text: 'How satisfied are you?',
  type: 'RATING',
  options: null,
  required: true,
  sortOrder: 0,
};

/** Example survey response */
const exampleResponse = {
  id: 'response-uuid-1',
  surveyId: 'survey-uuid-1',
  userId: '1',
  answers: { 'question-uuid-1': 5 },
  createdAt: new Date('2025-01-10').toISOString(),
};

beforeEach(() => {
  vi.clearAllMocks();
});

// ─── GET / ────────────────────────────────────────────────────────────────────

describe('GET /api/platform/surveys', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(401);
  });

  it('returns all surveys for authenticated user', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findMany.mockResolvedValue([exampleSurvey]);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
  });

  it('filters by active=true when query param provided', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findMany.mockResolvedValue([exampleSurvey]);
    const res = await request(app).get('/api/platform/surveys?active=true');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ active: true });
  });

  it('filters by active=false when query param provided', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys?active=false');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(callArgs.where).toMatchObject({ active: false });
  });

  it('does not filter when active param is omitted', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.survey.findMany.mockResolvedValue([exampleSurvey]);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(200);
    const callArgs = mockPrisma.survey.findMany.mock.calls[0][0];
    expect(callArgs.where).not.toHaveProperty('active');
  });

  it('returns surveys accessible to EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findMany.mockResolvedValue([exampleSurvey]);
    const res = await request(app).get('/api/platform/surveys');
    expect(res.status).toBe(200);
  });
});

// ─── GET /:id ─────────────────────────────────────────────────────────────────

describe('GET /api/platform/surveys/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/surveys/nonexistent');
    expect(res.status).toBe(404);
  });

  it('returns survey with questions and response count', async () => {
    const app = buildApp('VIEWER');
    const surveyWithQuestions = {
      ...exampleSurvey,
      questions: [exampleQuestion],
      _count: { responses: 2 },
    };
    mockPrisma.survey.findUnique.mockResolvedValue(surveyWithQuestions);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(200);
    expect(res.body.id).toBe('survey-uuid-1');
    expect(res.body.title).toBe('Resident Satisfaction Survey');
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body._count.responses).toBe(2);
  });

  it('returns survey for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [] });
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(200);
  });
});

// ─── POST / ──────────────────────────────────────────────────────────────────

describe('POST /api/platform/surveys', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test', description: 'Test desc' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test', description: 'Test desc' });
    expect(res.status).toBe(403);
  });

  it('returns 400 when title is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ description: 'Test description' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/title/i);
  });

  it('returns 400 when description is missing', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test Survey' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/description/i);
  });

  it('returns 400 when questions is not an array', async () => {
    const app = buildApp('EDITOR');
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Test', description: 'Desc', questions: 'not-an-array' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/questions/i);
  });

  it('creates survey without questions for EDITOR+', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.survey.create.mockResolvedValue({ ...exampleSurvey, questions: [], _count: { responses: 0 } });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'New Survey', description: 'Survey description' });
    expect(res.status).toBe(201);
    expect(res.body.title).toBe('Resident Satisfaction Survey');
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(createArgs.data.title).toBe('New Survey');
    expect(createArgs.data.description).toBe('Survey description');
  });

  it('sets createdBy from session user on creation', async () => {
    const app = buildApp('EDITOR', 42);
    mockPrisma.survey.create.mockResolvedValue({ ...exampleSurvey, questions: [], _count: { responses: 0 } });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Survey', description: 'Desc' });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(String(createArgs.data.createdBy)).toBe('42');
  });

  it('creates survey with questions', async () => {
    const app = buildApp('EDITOR', 1);
    mockPrisma.survey.create.mockResolvedValue({
      ...exampleSurvey,
      questions: [exampleQuestion],
      _count: { responses: 0 },
    });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({
        title: 'Survey with Questions',
        description: 'Desc',
        questions: [
          { text: 'Rate your satisfaction', type: 'RATING', sortOrder: 0 },
          { text: 'Any comments?', type: 'TEXT', required: false, sortOrder: 1 },
        ],
      });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(createArgs.data.questions.create).toHaveLength(2);
    expect(createArgs.data.questions.create[0].text).toBe('Rate your satisfaction');
    expect(createArgs.data.questions.create[1].required).toBe(false);
  });

  it('creates survey with active=false', async () => {
    const app = buildApp('ADMIN', 1);
    mockPrisma.survey.create.mockResolvedValue({
      ...exampleSurvey,
      active: false,
      questions: [],
      _count: { responses: 0 },
    });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Inactive Survey', description: 'Desc', active: false });
    expect(res.status).toBe(201);
    const createArgs = mockPrisma.survey.create.mock.calls[0][0];
    expect(createArgs.data.active).toBe(false);
  });

  it('creates survey for ADMIN role', async () => {
    const app = buildApp('ADMIN', 1);
    mockPrisma.survey.create.mockResolvedValue({ ...exampleSurvey, questions: [], _count: { responses: 0 } });
    const res = await request(app)
      .post('/api/platform/surveys')
      .send({ title: 'Admin Survey', description: 'Admin desc' });
    expect(res.status).toBe(201);
  });
});

// ─── PUT /:id ─────────────────────────────────────────────────────────────────

describe('PUT /api/platform/surveys/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).put('/api/platform/surveys/survey-uuid-1').send({ title: 'Updated' });
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).put('/api/platform/surveys/survey-uuid-1').send({ title: 'Updated' });
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).put('/api/platform/surveys/nonexistent').send({ title: 'Updated' });
    expect(res.status).toBe(404);
  });

  it('updates survey title for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.survey.update.mockResolvedValue({
      ...exampleSurvey,
      title: 'Updated Survey',
      questions: [],
      _count: { responses: 0 },
    });
    const res = await request(app).put('/api/platform/surveys/survey-uuid-1').send({ title: 'Updated Survey' });
    expect(res.status).toBe(200);
    expect(res.body.title).toBe('Updated Survey');
  });

  it('updates survey active status', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.survey.update.mockResolvedValue({
      ...exampleSurvey,
      active: false,
      questions: [],
      _count: { responses: 0 },
    });
    const res = await request(app).put('/api/platform/surveys/survey-uuid-1').send({ active: false });
    expect(res.status).toBe(200);
    const updateArgs = mockPrisma.survey.update.mock.calls[0][0];
    expect(updateArgs.data.active).toBe(false);
  });

  it('adds new question when questions array has entries without id', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyQuestion.create.mockResolvedValue(exampleQuestion);
    mockPrisma.survey.update.mockResolvedValue({
      ...exampleSurvey,
      questions: [exampleQuestion],
      _count: { responses: 0 },
    });
    const res = await request(app)
      .put('/api/platform/surveys/survey-uuid-1')
      .send({
        questions: [{ text: 'New question', type: 'TEXT' }],
      });
    expect(res.status).toBe(200);
    expect(mockPrisma.surveyQuestion.create).toHaveBeenCalledOnce();
    const createArgs = mockPrisma.surveyQuestion.create.mock.calls[0][0];
    expect(createArgs.data.text).toBe('New question');
    expect(createArgs.data.surveyId).toBe('survey-uuid-1');
  });

  it('updates existing question when questions array has entries with id', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyQuestion.update.mockResolvedValue({ ...exampleQuestion, text: 'Updated question' });
    mockPrisma.survey.update.mockResolvedValue({
      ...exampleSurvey,
      questions: [{ ...exampleQuestion, text: 'Updated question' }],
      _count: { responses: 0 },
    });
    const res = await request(app)
      .put('/api/platform/surveys/survey-uuid-1')
      .send({
        questions: [{ id: 'question-uuid-1', text: 'Updated question' }],
      });
    expect(res.status).toBe(200);
    expect(mockPrisma.surveyQuestion.update).toHaveBeenCalledOnce();
    const updateArgs = mockPrisma.surveyQuestion.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe('question-uuid-1');
    expect(updateArgs.data.text).toBe('Updated question');
  });

  it('returns 400 when questions is not an array in PUT', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    const res = await request(app)
      .put('/api/platform/surveys/survey-uuid-1')
      .send({ questions: 'invalid' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/questions/i);
  });
});

// ─── DELETE /:id ─────────────────────────────────────────────────────────────

describe('DELETE /api/platform/surveys/:id', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).delete('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).delete('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).delete('/api/platform/surveys/nonexistent');
    expect(res.status).toBe(404);
  });

  it('deletes survey with cascade for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyResponse.deleteMany.mockResolvedValue({ count: 2 });
    mockPrisma.surveyQuestion.deleteMany.mockResolvedValue({ count: 1 });
    mockPrisma.survey.delete.mockResolvedValue(exampleSurvey);
    const res = await request(app).delete('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(204);
    expect(mockPrisma.surveyResponse.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.surveyQuestion.deleteMany).toHaveBeenCalledOnce();
    expect(mockPrisma.survey.delete).toHaveBeenCalledOnce();
    // Verify cascade order: responses first, then questions, then survey
    const responseDeleteArgs = mockPrisma.surveyResponse.deleteMany.mock.calls[0][0];
    expect(responseDeleteArgs.where.surveyId).toBe('survey-uuid-1');
    const questionDeleteArgs = mockPrisma.surveyQuestion.deleteMany.mock.calls[0][0];
    expect(questionDeleteArgs.where.surveyId).toBe('survey-uuid-1');
    const surveyDeleteArgs = mockPrisma.survey.delete.mock.calls[0][0];
    expect(surveyDeleteArgs.where.id).toBe('survey-uuid-1');
  });

  it('deletes survey for ADMIN role', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyResponse.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.surveyQuestion.deleteMany.mockResolvedValue({ count: 0 });
    mockPrisma.survey.delete.mockResolvedValue(exampleSurvey);
    const res = await request(app).delete('/api/platform/surveys/survey-uuid-1');
    expect(res.status).toBe(204);
  });
});

// ─── POST /:id/respond ────────────────────────────────────────────────────────

describe('POST /api/platform/surveys/:id/respond', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(401);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app)
      .post('/api/platform/surveys/nonexistent/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(404);
  });

  it('returns 400 when answers is missing or invalid', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [] });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: 'not-an-object' });
    expect(res.status).toBe(400);
    expect(res.body.message).toMatch(/answers/i);
  });

  it('returns 400 when answers is an array', async () => {
    const app = buildApp('VIEWER');
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [] });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: ['answer1'] });
    expect(res.status).toBe(400);
  });

  it('creates a new response (201) when no existing response', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [exampleQuestion] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.surveyResponse.create.mockResolvedValue(exampleResponse);
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 5 } });
    expect(res.status).toBe(201);
    expect(mockPrisma.surveyResponse.create).toHaveBeenCalledOnce();
    expect(mockPrisma.surveyResponse.update).not.toHaveBeenCalled();
    const createArgs = mockPrisma.surveyResponse.create.mock.calls[0][0];
    expect(createArgs.data.surveyId).toBe('survey-uuid-1');
    expect(createArgs.data.answers).toMatchObject({ 'question-uuid-1': 5 });
  });

  it('updates existing response (200) when response already exists (upsert)', async () => {
    const app = buildApp('VIEWER', 1);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [exampleQuestion] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(exampleResponse);
    mockPrisma.surveyResponse.update.mockResolvedValue({
      ...exampleResponse,
      answers: { 'question-uuid-1': 4 },
    });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 4 } });
    expect(res.status).toBe(200);
    expect(mockPrisma.surveyResponse.update).toHaveBeenCalledOnce();
    expect(mockPrisma.surveyResponse.create).not.toHaveBeenCalled();
    const updateArgs = mockPrisma.surveyResponse.update.mock.calls[0][0];
    expect(updateArgs.where.id).toBe('response-uuid-1');
    expect(updateArgs.data.answers).toMatchObject({ 'question-uuid-1': 4 });
  });

  it('allows any authenticated role to respond', async () => {
    const app = buildApp('EDITOR', 2);
    mockPrisma.survey.findUnique.mockResolvedValue({ ...exampleSurvey, questions: [] });
    mockPrisma.surveyResponse.findFirst.mockResolvedValue(null);
    mockPrisma.surveyResponse.create.mockResolvedValue({ ...exampleResponse, userId: '2' });
    const res = await request(app)
      .post('/api/platform/surveys/survey-uuid-1/respond')
      .send({ answers: { 'question-uuid-1': 'yes' } });
    expect(res.status).toBe(201);
  });
});

// ─── GET /:id/responses ───────────────────────────────────────────────────────

describe('GET /api/platform/surveys/:id/responses', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/responses');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/responses');
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/surveys/nonexistent/responses');
    expect(res.status).toBe(404);
  });

  it('returns responses for EDITOR+', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyResponse.findMany.mockResolvedValue([
      { ...exampleResponse, user: { id: '1' } },
    ]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/responses');
    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(1);
    expect(res.body[0].surveyId).toBe('survey-uuid-1');
  });

  it('returns responses for ADMIN', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/responses');
    expect(res.status).toBe(200);
    expect(res.body).toEqual([]);
  });

  it('queries responses filtered by surveyId', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(exampleSurvey);
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    await request(app).get('/api/platform/surveys/survey-uuid-1/responses');
    const callArgs = mockPrisma.surveyResponse.findMany.mock.calls[0][0];
    expect(callArgs.where.surveyId).toBe('survey-uuid-1');
  });
});

// ─── GET /:id/results ─────────────────────────────────────────────────────────

describe('GET /api/platform/surveys/:id/results', () => {
  it('returns 401 when unauthenticated', async () => {
    const app = buildApp(null);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(401);
  });

  it('returns 403 for VIEWER role', async () => {
    const app = buildApp('VIEWER');
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(403);
  });

  it('returns 404 when survey not found', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue(null);
    const res = await request(app).get('/api/platform/surveys/nonexistent/results');
    expect(res.status).toBe(404);
  });

  it('returns aggregated results with zero responses', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue({
      ...exampleSurvey,
      questions: [exampleQuestion],
    });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
    expect(res.body.survey.id).toBe('survey-uuid-1');
    expect(res.body.totalResponses).toBe(0);
    expect(Array.isArray(res.body.questions)).toBe(true);
    expect(res.body.questions[0].id).toBe('question-uuid-1');
    expect(res.body.questions[0].responses).toEqual([]);
  });

  it('returns per-response list for each answer', async () => {
    const app = buildApp('EDITOR');
    mockPrisma.survey.findUnique.mockResolvedValue({
      ...exampleSurvey,
      questions: [exampleQuestion],
    });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([
      { answers: { 'question-uuid-1': 5 } },
      { answers: { 'question-uuid-1': 5 } },
      { answers: { 'question-uuid-1': 4 } },
    ]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
    expect(res.body.totalResponses).toBe(3);
    const qResult = res.body.questions[0];
    expect(qResult.responses).toHaveLength(3);
    const values = qResult.responses.map((r: { value: string }) => r.value);
    expect(values.filter((v: string) => v === '5')).toHaveLength(2);
    expect(values.filter((v: string) => v === '4')).toHaveLength(1);
  });

  it('returns results for ADMIN', async () => {
    const app = buildApp('ADMIN');
    mockPrisma.survey.findUnique.mockResolvedValue({
      ...exampleSurvey,
      questions: [exampleQuestion],
    });
    mockPrisma.surveyResponse.findMany.mockResolvedValue([]);
    const res = await request(app).get('/api/platform/surveys/survey-uuid-1/results');
    expect(res.status).toBe(200);
    expect(res.body.survey.id).toBe('survey-uuid-1');
  });
});
