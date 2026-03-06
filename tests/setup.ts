import { beforeEach } from 'vitest';
import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import type { TestAgent } from 'supertest';
import app from '../server/app.js';

const TEST_DB_URL = 'postgresql://postgres:postgres@localhost:5432/renzo_test';

// Set DATABASE_URL before any other module reads it
process.env.DATABASE_URL = TEST_DB_URL;

// Single shared Prisma client for all tests
export const testPrisma = new PrismaClient({
  datasources: { db: { url: TEST_DB_URL } },
});

beforeEach(async () => {
  // Clean all tables before each test (children before parents to satisfy FK constraints)
  await testPrisma.publishedSnapshot.deleteMany();
  await testPrisma.session.deleteMany();

  // Platform schema — leaf/child tables first
  await testPrisma.chatMessage.deleteMany();
  await testPrisma.chatSession.deleteMany();
  await testPrisma.listingImage.deleteMany();
  await testPrisma.marketplaceListing.deleteMany();
  await testPrisma.postUpvote.deleteMany();
  await testPrisma.forumPost.deleteMany();
  await testPrisma.forumThread.deleteMany();
  await testPrisma.forumCategory.deleteMany();
  await testPrisma.announcementRead.deleteMany();
  await testPrisma.announcement.deleteMany();
  await testPrisma.directoryEntry.deleteMany();
  await testPrisma.surveyResponse.deleteMany();
  await testPrisma.surveyQuestion.deleteMany();
  await testPrisma.survey.deleteMany();
  await testPrisma.consentSignature.deleteMany();
  await testPrisma.consentForm.deleteMany();
  await testPrisma.trainingCompletion.deleteMany();
  await testPrisma.paymentItem.deleteMany();
  await testPrisma.payment.deleteMany();
  await testPrisma.bookingPayment.deleteMany();
  await testPrisma.booking.deleteMany();
  await testPrisma.violationComment.deleteMany();
  await testPrisma.violation.deleteMany();
  await testPrisma.eventRSVP.deleteMany();
  await testPrisma.platformEvent.deleteMany();
  await testPrisma.documentVersion.deleteMany();
  await testPrisma.document.deleteMany();
  await testPrisma.documentCategory.deleteMany();
  await testPrisma.searchIndex.deleteMany();
  await testPrisma.upload.deleteMany();
  // Maintenance tables (delete children before parents due to FK constraints)
  await testPrisma.maintenancePhoto.deleteMany();
  await testPrisma.maintenanceComment.deleteMany();
  await testPrisma.maintenanceRequest.deleteMany();
  // Visitor tables (delete children before parents due to FK constraints)
  await testPrisma.visitorLog.deleteMany();
  await testPrisma.visitor.deleteMany();
  // ChatMessage → ChatSession → PlatformUser — must be deleted in order
  await testPrisma.chatMessage.deleteMany();
  await testPrisma.chatSession.deleteMany();
  // PlatformUser must be deleted before User (no cascade)
  await testPrisma.platformUser.deleteMany();
  await testPrisma.message.deleteMany();
  await testPrisma.user.deleteMany();

  // Amenity platform tables
  await testPrisma.amenityImage.deleteMany();
  await testPrisma.amenityRule.deleteMany();
  await testPrisma.amenity.deleteMany();

  // Other standalone tables
  await testPrisma.platformSetting.deleteMany();
  await testPrisma.service.deleteMany();
  await testPrisma.event.deleteMany();
  await testPrisma.advisory.deleteMany();
  await testPrisma.buildingConfig.deleteMany();
  await testPrisma.parcel.deleteMany();
});

const TEST_ADMIN = { username: 'testadmin', password: 'testpassword123' };

/**
 * Create a test admin user and return an authenticated supertest agent.
 * The agent maintains cookies (session) across requests.
 */
export async function authenticatedAgent(role: 'ADMIN' | 'EDITOR' | 'VIEWER' = 'ADMIN'): Promise<TestAgent> {
  const passwordHash = await bcrypt.hash(TEST_ADMIN.password, 4); // low rounds for speed
  await testPrisma.user.create({
    data: { username: TEST_ADMIN.username, passwordHash, role },
  });

  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username: TEST_ADMIN.username, password: TEST_ADMIN.password })
    .expect(200);

  const csrfRes = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken = csrfRes.body?.token;
  if (!csrfToken) {
    throw new Error('Missing CSRF token for authenticated test agent');
  }

  const agentAny = agent as TestAgent & Record<string, (...args: any[]) => any>;
  for (const method of ['post', 'put', 'delete', 'patch']) {
    const original = agentAny[method].bind(agentAny);
    agentAny[method] = (...args: any[]) => original(...args).set('X-CSRF-Token', csrfToken);
  }

  return agent;
}
