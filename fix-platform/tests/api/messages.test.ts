import { describe, it, expect, beforeEach } from 'vitest';
import request from 'supertest';
import app from '../../server/app.js';
import { testPrisma, authenticatedAgent } from '../setup.js';
import bcrypt from 'bcryptjs';

// Helper: create a second user and return an authenticated agent for them
async function createSecondUserAndAgent(username = 'seconduser', role: 'ADMIN' | 'EDITOR' | 'VIEWER' = 'EDITOR') {
  const passwordHash = await bcrypt.hash('testpassword123', 4);
  const user = await testPrisma.user.create({
    data: { username, passwordHash, role },
  });

  const agent = request.agent(app);
  await agent
    .post('/api/auth/login')
    .send({ username, password: 'testpassword123' })
    .expect(200);

  const csrfRes = await agent.get('/api/auth/csrf').expect(200);
  const csrfToken = csrfRes.body?.token;
  if (!csrfToken) throw new Error('Missing CSRF token');

  const agentAny = agent as any;
  for (const method of ['post', 'put', 'delete', 'patch']) {
    const original = agentAny[method].bind(agentAny);
    agentAny[method] = (...args: any[]) => original(...args).set('X-CSRF-Token', csrfToken);
  }

  return { agent, user };
}

describe('Messages API', () => {
  describe('unauthenticated', () => {
    it('GET /api/messages/inbox returns 401', async () => {
      const res = await request(app).get('/api/messages/inbox');
      expect(res.status).toBe(401);
    });

    it('GET /api/messages/sent returns 401', async () => {
      const res = await request(app).get('/api/messages/sent');
      expect(res.status).toBe(401);
    });

    it('GET /api/messages/unread-count returns 401', async () => {
      const res = await request(app).get('/api/messages/unread-count');
      expect(res.status).toBe(401);
    });

    it('POST /api/messages returns 401', async () => {
      const res = await request(app)
        .post('/api/messages')
        .send({ recipientId: 1, body: 'hello' });
      expect(res.status).toBe(401);
    });
  });

  describe('authenticated — inbox', () => {
    it('GET /api/messages/inbox returns empty array when no messages', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const res = await agent.get('/api/messages/inbox');
      expect(res.status).toBe(200);
      expect(Array.isArray(res.body)).toBe(true);
      expect(res.body).toHaveLength(0);
    });

    it('GET /api/messages/inbox returns received messages', async () => {
      const { agent: senderAgent, user: sender } = await createSecondUserAndAgent('sender1');
      const recipientAgent = await authenticatedAgent('EDITOR');

      // Get recipient user id
      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      // Send a message from sender to recipient
      await senderAgent.post('/api/messages').send({
        recipientId,
        subject: 'Hello',
        body: 'This is a test message',
      }).expect(201);

      const res = await recipientAgent.get('/api/messages/inbox');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].subject).toBe('Hello');
      expect(res.body[0].body).toBe('This is a test message');
      expect(res.body[0].senderId).toBe(sender.id);
    });

    it('GET /api/messages/inbox shows unread messages first', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('sender2');
      const recipientAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      // Send two messages
      const msg1Res = await senderAgent.post('/api/messages').send({
        recipientId,
        subject: 'First',
        body: 'first message',
      }).expect(201);

      const msg2Res = await senderAgent.post('/api/messages').send({
        recipientId,
        subject: 'Second',
        body: 'second message',
      }).expect(201);

      // Mark first message as read
      await recipientAgent.put(`/api/messages/${msg1Res.body.id}/read`).expect(200);

      const res = await recipientAgent.get('/api/messages/inbox');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(2);
      // Unread (msg2) should come first
      expect(res.body[0].id).toBe(msg2Res.body.id);
      expect(res.body[1].id).toBe(msg1Res.body.id);
    });

    it('GET /api/messages/inbox does not show messages sent to others', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('sender3');
      const { agent: otherAgent, user: otherUser } = await createSecondUserAndAgent('otheruser3');
      const recipientAgent = await authenticatedAgent('EDITOR');

      // Send to otherUser, not to recipientAgent
      await senderAgent.post('/api/messages').send({
        recipientId: otherUser.id,
        body: 'Not for you',
      }).expect(201);

      const res = await recipientAgent.get('/api/messages/inbox');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('authenticated — sent', () => {
    it('GET /api/messages/sent returns sent messages', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('recipient1');

      await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
        subject: 'Sent subject',
        body: 'Sent body',
      }).expect(201);

      const res = await senderAgent.get('/api/messages/sent');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(1);
      expect(res.body[0].subject).toBe('Sent subject');
    });

    it('GET /api/messages/sent does not show others sent messages', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { agent: otherAgent } = await createSecondUserAndAgent('other_sender1');
      const { user: recipient } = await createSecondUserAndAgent('recipient2');

      // Other user sends a message
      await otherAgent.post('/api/messages').send({
        recipientId: recipient.id,
        body: 'Not yours',
      }).expect(201);

      const res = await senderAgent.get('/api/messages/sent');
      expect(res.status).toBe(200);
      expect(res.body).toHaveLength(0);
    });
  });

  describe('authenticated — send message', () => {
    it('POST /api/messages creates a message (201)', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('recipient3');

      const res = await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
        subject: 'Test subject',
        body: 'Test body',
      });
      expect(res.status).toBe(201);
      expect(res.body.id).toBeTruthy();
      expect(res.body.subject).toBe('Test subject');
      expect(res.body.body).toBe('Test body');
      expect(res.body.recipientId).toBe(recipient.id);
      expect(res.body.readAt).toBeNull();
    });

    it('POST /api/messages without subject is ok (subject is optional)', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('recipient4');

      const res = await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
        body: 'No subject',
      });
      expect(res.status).toBe(201);
      expect(res.body.subject).toBeNull();
    });

    it('POST /api/messages without body returns 400', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('recipient5');

      const res = await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/messages without recipientId returns 400', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');

      const res = await senderAgent.post('/api/messages').send({
        body: 'No recipient',
      });
      expect(res.status).toBe(400);
    });

    it('POST /api/messages to non-existent recipient returns 404', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');

      const res = await senderAgent.post('/api/messages').send({
        recipientId: 999999,
        body: 'Ghost recipient',
      });
      expect(res.status).toBe(404);
    });
  });

  describe('authenticated — get single message', () => {
    it('GET /api/messages/:id returns message for recipient', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('msg_sender1');
      const recipientAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      const sent = await senderAgent.post('/api/messages').send({
        recipientId,
        subject: 'Direct message',
        body: 'Hello there',
      }).expect(201);

      const res = await recipientAgent.get(`/api/messages/${sent.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sent.body.id);
      expect(res.body.subject).toBe('Direct message');
    });

    it('GET /api/messages/:id returns message for sender', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('msg_recipient1');

      const sent = await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
        body: 'My sent message',
      }).expect(201);

      const res = await senderAgent.get(`/api/messages/${sent.body.id}`);
      expect(res.status).toBe(200);
      expect(res.body.id).toBe(sent.body.id);
    });

    it('GET /api/messages/:id returns 403 for unrelated user', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('msg_sender2');
      const { agent: recipientAgent } = await createSecondUserAndAgent('msg_recipient2');
      const unrelatedAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      const sent = await senderAgent.post('/api/messages').send({
        recipientId,
        body: 'Private message',
      }).expect(201);

      const res = await unrelatedAgent.get(`/api/messages/${sent.body.id}`);
      expect(res.status).toBe(403);
    });

    it('GET /api/messages/:id returns 404 for non-existent id', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const res = await agent.get('/api/messages/non-existent-uuid-id');
      expect(res.status).toBe(404);
    });
  });

  describe('authenticated — mark as read', () => {
    it('PUT /api/messages/:id/read marks message as read', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('read_sender1');
      const recipientAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      const sent = await senderAgent.post('/api/messages').send({
        recipientId,
        body: 'Read me',
      }).expect(201);

      expect(sent.body.readAt).toBeNull();

      const res = await recipientAgent.put(`/api/messages/${sent.body.id}/read`);
      expect(res.status).toBe(200);
      expect(res.body.readAt).not.toBeNull();
    });

    it('PUT /api/messages/:id/read returns 403 for non-recipient', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('read_sender2');
      const { agent: recipientAgent } = await createSecondUserAndAgent('read_recipient2');
      const unrelatedAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      const sent = await senderAgent.post('/api/messages').send({
        recipientId,
        body: 'Mark me',
      }).expect(201);

      const res = await unrelatedAgent.put(`/api/messages/${sent.body.id}/read`);
      expect(res.status).toBe(403);
    });

    it('PUT /api/messages/:id/read returns 403 for sender (only recipient can mark read)', async () => {
      const senderAgent = await authenticatedAgent('EDITOR');
      const { user: recipient } = await createSecondUserAndAgent('read_recipient3');

      const sent = await senderAgent.post('/api/messages').send({
        recipientId: recipient.id,
        body: 'Can sender mark read?',
      }).expect(201);

      const res = await senderAgent.put(`/api/messages/${sent.body.id}/read`);
      expect(res.status).toBe(403);
    });
  });

  describe('authenticated — unread count', () => {
    it('GET /api/messages/unread-count returns 0 when no messages', async () => {
      const agent = await authenticatedAgent('EDITOR');
      const res = await agent.get('/api/messages/unread-count');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(0);
    });

    it('GET /api/messages/unread-count returns count of unread messages', async () => {
      const { agent: senderAgent } = await createSecondUserAndAgent('uc_sender1');
      const recipientAgent = await authenticatedAgent('EDITOR');

      const meRes = await recipientAgent.get('/api/auth/me');
      const recipientId = meRes.body?.id;

      // Send 3 messages
      const msg1 = await senderAgent.post('/api/messages').send({ recipientId, body: 'msg1' }).expect(201);
      await senderAgent.post('/api/messages').send({ recipientId, body: 'msg2' }).expect(201);
      await senderAgent.post('/api/messages').send({ recipientId, body: 'msg3' }).expect(201);

      // Mark one as read
      await recipientAgent.put(`/api/messages/${msg1.body.id}/read`).expect(200);

      const res = await recipientAgent.get('/api/messages/unread-count');
      expect(res.status).toBe(200);
      expect(res.body.count).toBe(2);
    });
  });
});
