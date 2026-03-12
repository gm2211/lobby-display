/**
 * Survey CRUD API Routes
 *
 * ROUTES:
 * - GET /api/platform/surveys              - List surveys with question/response counts (any auth)
 * - GET /api/platform/surveys/:id          - Survey detail with questions and response count (any auth)
 * - POST /api/platform/surveys             - Create survey with questions (EDITOR+ required)
 * - PUT /api/platform/surveys/:id          - Update survey (EDITOR+ required)
 * - DELETE /api/platform/surveys/:id       - Delete survey (cascade, EDITOR+ required)
 * - POST /api/platform/surveys/:id/respond - Submit survey response (any auth, upsert per user)
 * - GET /api/platform/surveys/:id/responses - List responses for survey (EDITOR+ required)
 * - GET /api/platform/surveys/:id/results  - Aggregated results per question/answer (EDITOR+ required)
 *
 * AUTH MODEL:
 * - GETs require authentication (any role: VIEWER, EDITOR, ADMIN)
 * - Mutations (POST/PUT/DELETE) require EDITOR+
 * - POST /:id/respond requires any authenticated user (residents submit responses)
 * - GET /:id/responses and GET /:id/results require EDITOR+
 *
 * GOTCHAS:
 * - Survey, SurveyQuestion, and SurveyResponse use UUID strings as IDs, NOT integers
 * - session.user.id is a number (User.id), cast to string for PlatformUser UUID relations
 * - SurveyResponse answers stored as JSON; each response is upserted per (surveyId, userId)
 * - There is no unique constraint on (surveyId, userId) in the schema, so we use upsert
 *   via findFirst + update/create pattern instead of prisma upsert
 * - DELETE cascades by deleting questions and responses before the survey
 *
 * RELATED FILES:
 * - server/middleware/auth.ts         - requireAuth, requireMinRole
 * - server/middleware/errorHandler.ts - asyncHandler, NotFoundError, ValidationError
 * - prisma/schema.prisma              - Survey, SurveyQuestion, SurveyResponse models
 * - tests/unit/survey-routes.test.ts  - unit tests (Prisma mocked)
 */
import { Router } from 'express';
import prisma from '../../db.js';
import { asyncHandler, NotFoundError, ValidationError } from '../../middleware/errorHandler.js';
import { requireAuth, requireMinRole } from '../../middleware/auth.js';
import { platformProtectStrict } from '../../middleware/platformAuth.js';

const router = Router();

// Apply platformProtectStrict so req.platformUser is available for eligibility checks
router.use(platformProtectStrict);

const VALID_QUESTION_TYPES = ['TEXT', 'MULTIPLE_CHOICE', 'CHECKBOX', 'RATING', 'YES_NO'] as const;

// ---------------------------------------------------------------------------
// GET /:id/responses - List responses for survey (EDITOR+ required)
// Must appear before /:id to avoid route conflict
// ---------------------------------------------------------------------------
router.get(
  '/:id/responses',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const survey = await prisma.survey.findUnique({ where: { id } });
    if (!survey) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    const responses = await prisma.surveyResponse.findMany({
      where: { surveyId: id },
      include: {
        user: {
          select: { id: true },
        },
      },
      orderBy: { createdAt: 'asc' },
    });

    res.json(responses);
  })
);

// ---------------------------------------------------------------------------
// GET /:id/results - Aggregated results per question/answer (EDITOR+ required)
// Must appear before /:id to avoid route conflict
//
// Returns SurveyResultsData shape:
// {
//   survey: Survey,
//   totalResponses: number,
//   questions: Array<{
//     id: string,
//     text: string,
//     type: QuestionType,
//     options?: string[],
//     responses: Array<{ value: string }>
//   }>
// }
// ---------------------------------------------------------------------------
router.get(
  '/:id/results',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { responses: true } },
      },
    });
    if (!survey) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    const surveyResponses = await prisma.surveyResponse.findMany({
      where: { surveyId: id },
      select: { answers: true },
    });

    // Build per-question flat response lists
    // Each answer in a response is { questionId: value } JSON
    const questionResponses: Record<string, Array<{ value: string }>> = {};
    for (const question of survey.questions) {
      questionResponses[question.id] = [];
    }

    for (const response of surveyResponses) {
      const answers = response.answers as Record<string, unknown>;
      for (const [questionId, answer] of Object.entries(answers)) {
        if (!questionResponses[questionId]) {
          questionResponses[questionId] = [];
        }
        // For MULTIPLE_CHOICE answers stored as arrays, expand each option as a separate response
        if (Array.isArray(answer)) {
          for (const val of answer) {
            questionResponses[questionId].push({ value: String(val) });
          }
        } else {
          questionResponses[questionId].push({ value: String(answer) });
        }
      }
    }

    res.json({
      survey,
      totalResponses: surveyResponses.length,
      questions: survey.questions.map((q) => ({
        id: q.id,
        text: q.text,
        type: q.type,
        options: q.options as string[],
        responses: questionResponses[q.id] ?? [],
      })),
    });
  })
);

// ---------------------------------------------------------------------------
// GET / - List surveys with question and response counts (any auth)
// ---------------------------------------------------------------------------
router.get(
  '/',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { active } = req.query;

    const where: Record<string, unknown> = {};
    if (active === 'true') {
      where.active = true;
    } else if (active === 'false') {
      where.active = false;
    }

    const surveys = await prisma.survey.findMany({
      where,
      include: {
        _count: {
          select: { questions: true, responses: true },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    // Filter out surveys whose time window has not started or has ended
    const now = new Date();
    const filtered = surveys.filter((s) => {
      if (s.startsAt && now < s.startsAt) return false;
      if (s.endsAt && now > s.endsAt) return false;
      return true;
    });

    res.json(filtered);
  })
);

// ---------------------------------------------------------------------------
// GET /:id - Survey detail with questions and response count (any auth)
// ---------------------------------------------------------------------------
router.get(
  '/:id',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const survey = await prisma.survey.findUnique({
      where: { id },
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { responses: true } },
      },
    });

    if (!survey) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    res.json(survey);
  })
);

// ---------------------------------------------------------------------------
// POST / - Create survey with questions (EDITOR+ required)
// ---------------------------------------------------------------------------
router.post(
  '/',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { title, description, active, startsAt, endsAt, questions } = req.body;

    if (!title || typeof title !== 'string' || !title.trim()) {
      throw new ValidationError('title is required');
    }
    if (!description || typeof description !== 'string' || !description.trim()) {
      throw new ValidationError('description is required');
    }

    // Validate questions if provided
    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        throw new ValidationError('questions must be an array');
      }
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (!q.text || typeof q.text !== 'string' || !q.text.trim()) {
          throw new ValidationError(`questions[${i}].text is required`);
        }
        if (!q.type || typeof q.type !== 'string') {
          throw new ValidationError(`questions[${i}].type is required`);
        }
      }
    }

    const createdBy = req.session.user!.id as unknown as string;

    const survey = await prisma.survey.create({
      data: {
        title: title.trim(),
        description: description.trim(),
        active: active !== undefined ? Boolean(active) : true,
        startsAt: startsAt ? new Date(startsAt) : null,
        endsAt: endsAt ? new Date(endsAt) : null,
        createdBy,
        questions:
          questions && Array.isArray(questions) && questions.length > 0
            ? {
                create: questions.map(
                  (q: {
                    text: string;
                    type: string;
                    options?: unknown;
                    required?: boolean;
                    sortOrder?: number;
                  }) => ({
                    text: q.text.trim(),
                    type: q.type,
                    options: q.options ?? null,
                    required: q.required !== undefined ? Boolean(q.required) : true,
                    sortOrder: q.sortOrder ?? 0,
                  })
                ),
              }
            : undefined,
      },
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { responses: true } },
      },
    });

    res.status(201).json(survey);
  })
);

// ---------------------------------------------------------------------------
// PUT /:id - Update survey (EDITOR+ required)
// ---------------------------------------------------------------------------
router.put(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { title, description, active, startsAt, endsAt, questions } = req.body;

    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    const data: Record<string, unknown> = {};
    if (title !== undefined) {
      if (typeof title !== 'string' || !title.trim()) {
        throw new ValidationError('title must be a non-empty string');
      }
      data.title = title.trim();
    }
    if (description !== undefined) {
      if (typeof description !== 'string' || !description.trim()) {
        throw new ValidationError('description must be a non-empty string');
      }
      data.description = description.trim();
    }
    if (active !== undefined) data.active = Boolean(active);
    if (startsAt !== undefined) data.startsAt = startsAt ? new Date(startsAt) : null;
    if (endsAt !== undefined) data.endsAt = endsAt ? new Date(endsAt) : null;

    // Update questions if provided: create new ones (upsert by id if id present)
    if (questions !== undefined) {
      if (!Array.isArray(questions)) {
        throw new ValidationError('questions must be an array');
      }

      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        if (q.id) {
          // Update existing question
          await prisma.surveyQuestion.update({
            where: { id: q.id },
            data: {
              text: q.text !== undefined ? String(q.text).trim() : undefined,
              type: q.type !== undefined ? String(q.type) : undefined,
              options: q.options !== undefined ? q.options : undefined,
              required: q.required !== undefined ? Boolean(q.required) : undefined,
              sortOrder: q.sortOrder !== undefined ? Number(q.sortOrder) : undefined,
            },
          });
        } else {
          // Create new question
          if (!q.text || typeof q.text !== 'string' || !q.text.trim()) {
            throw new ValidationError(`questions[${i}].text is required for new questions`);
          }
          if (!q.type || typeof q.type !== 'string') {
            throw new ValidationError(`questions[${i}].type is required for new questions`);
          }
          await prisma.surveyQuestion.create({
            data: {
              surveyId: id,
              text: q.text.trim(),
              type: q.type,
              options: q.options ?? null,
              required: q.required !== undefined ? Boolean(q.required) : true,
              sortOrder: q.sortOrder ?? 0,
            },
          });
        }
      }
    }

    const updated = await prisma.survey.update({
      where: { id },
      data,
      include: {
        questions: { orderBy: { sortOrder: 'asc' } },
        _count: { select: { responses: true } },
      },
    });

    res.json(updated);
  })
);

// ---------------------------------------------------------------------------
// DELETE /:id - Delete survey (cascade delete questions and responses, EDITOR+ required)
// ---------------------------------------------------------------------------
router.delete(
  '/:id',
  requireAuth,
  requireMinRole('EDITOR'),
  asyncHandler(async (req, res) => {
    const { id } = req.params;

    const existing = await prisma.survey.findUnique({ where: { id } });
    if (!existing) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    // Cascade delete: responses -> questions -> survey
    await prisma.surveyResponse.deleteMany({ where: { surveyId: id } });
    await prisma.surveyQuestion.deleteMany({ where: { surveyId: id } });
    await prisma.survey.delete({ where: { id } });

    res.status(204).end();
  })
);

// ---------------------------------------------------------------------------
// POST /:id/respond - Submit survey response (any auth, one response per user via upsert)
// ---------------------------------------------------------------------------
router.post(
  '/:id/respond',
  requireAuth,
  asyncHandler(async (req, res) => {
    const { id } = req.params;
    const { answers } = req.body;

    const survey = await prisma.survey.findUnique({
      where: { id },
      include: { questions: true },
    });
    if (!survey) {
      throw new NotFoundError(`Survey ${id} not found`);
    }

    if (!survey.active) {
      throw new ValidationError('This survey is not currently active');
    }

    const now = new Date();
    if (survey.startsAt && now < survey.startsAt) {
      throw new ValidationError('This survey has not started yet');
    }
    if (survey.endsAt && now > survey.endsAt) {
      throw new ValidationError('This survey has ended');
    }

    if (!answers || typeof answers !== 'object' || Array.isArray(answers)) {
      throw new ValidationError('answers must be an object mapping questionId to answer');
    }

    const userId = req.session.user!.id as unknown as string;

    // Upsert: one response per user per survey
    const existing = await prisma.surveyResponse.findFirst({
      where: { surveyId: id, userId },
    });

    let response;
    if (existing) {
      response = await prisma.surveyResponse.update({
        where: { id: existing.id },
        data: { answers },
      });
    } else {
      response = await prisma.surveyResponse.create({
        data: {
          surveyId: id,
          userId,
          answers,
        },
      });
    }

    res.status(existing ? 200 : 201).json(response);
  })
);

export default router;
