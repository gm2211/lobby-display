import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import request from 'supertest';
import path from 'path';
import fs from 'fs';
import app from '../../server/app.js';
import { authenticatedAgent } from '../setup.js';

const fixturesDir = path.resolve(__dirname, '../fixtures');

// Create a small valid PNG (1x1 pixel)
const VALID_PNG = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
  'base64'
);

// Create a small valid JPEG
const VALID_JPEG = Buffer.from(
  '/9j/4AAQSkZJRgABAQAAAQABAAD/2wBDAAgGBgcGBQgHBwcJCQgKDBQNDAsLDBkSEw8UHRofHh0aHBwgJC4nICIsIxwcKDcpLDAxNDQ0Hyc5PTgyPC4zNDL/2wBDAQkJCQwLDBgNDRgyIRwhMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjIyMjL/wAARCAABAAEDASIAAhEBAxEB/8QAHwAAAQUBAQEBAQEAAAAAAAAAAAECAwQFBgcICQoL/8QAtRAAAgEDAwIEAwUFBAQAAAF9AQIDAAQRBRIhMUEGE1FhByJxFDKBkaEII0KxwRVS0fAkM2JyggkKFhcYGRolJicoKSo0NTY3ODk6Q0RFRkdISUpTVFVWV1hZWmNkZWZnaGlqc3R1dnd4eXqDhIWGh4iJipKTlJWWl5iZmqKjpKWmp6ipqrKztLW2t7i5usLDxMXGx8jJytLT1NXW19jZ2uHi4+Tl5ufo6erx8vP09fb3+Pn6/8QAHwEAAwEBAQEBAQEBAQAAAAAAAAECAwQFBgcICQoL/8QAtREAAgECBAQDBAcFBAQAAQJ3AAECAxEEBSExBhJBUQdhcRMiMoEIFEKRobHBCSMzUvAVYnLRChYkNOEl8RcYI4Q/SFhSRDE8KjcOPi8x/8QAFAEBAAAAAAAAAAAAAAAAAAAAAP/EABQRAQAAAAAAAAAAAAAAAAAAAAD/2gAMAwEAAhEDEQA/ALtAH//Z',
  'base64'
);

describe('Upload API', () => {
  beforeAll(() => {
    fs.mkdirSync(fixturesDir, { recursive: true });
    fs.writeFileSync(path.join(fixturesDir, 'test.png'), VALID_PNG);
    fs.writeFileSync(path.join(fixturesDir, 'test.jpg'), VALID_JPEG);
    fs.writeFileSync(path.join(fixturesDir, 'test.txt'), 'not an image');
  });

  afterAll(() => {
    fs.rmSync(fixturesDir, { recursive: true, force: true });
  });

  it('POST /api/upload returns 403 for VIEWER role', async () => {
    const agent = await authenticatedAgent('VIEWER');
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.png'));
    expect(res.status).toBe(403);
  });

  it('POST /api/upload returns 200 for EDITOR role', async () => {
    const agent = await authenticatedAgent('EDITOR');
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.png'));
    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/uploads\//);
  });

  it('POST /api/upload rejects SVG files', async () => {
    fs.writeFileSync(path.join(fixturesDir, 'test.svg'), '<svg xmlns="http://www.w3.org/2000/svg"></svg>');
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.svg'));
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejects file with spoofed MIME type', async () => {
    // Write a text file with .png extension (wrong magic bytes)
    fs.writeFileSync(path.join(fixturesDir, 'fake.png'), 'this is not a png');
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'fake.png'));
    expect(res.status).toBe(400);
  });

  it('POST /api/upload returns 401 when unauthenticated', async () => {
    const res = await request(app)
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.png'));
    expect(res.status).toBe(401);
  });

  it('POST /api/upload accepts a valid PNG image', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.png'));

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/uploads\//);
  });

  it('POST /api/upload accepts a valid JPEG image', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.jpg'));

    expect(res.status).toBe(200);
    expect(res.body.url).toMatch(/^\/images\/uploads\//);
  });

  it('POST /api/upload returns 400 when no file is sent', async () => {
    const agent = await authenticatedAgent();
    const res = await agent.post('/api/upload');
    expect(res.status).toBe(400);
  });

  it('POST /api/upload rejects non-image MIME types', async () => {
    const agent = await authenticatedAgent();
    const res = await agent
      .post('/api/upload')
      .attach('file', path.join(fixturesDir, 'test.txt'));

    expect(res.status).toBe(400);
    expect(res.body.error).toMatch(/image/i);
  });
});
