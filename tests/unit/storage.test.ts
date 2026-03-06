import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';

// We'll import from the module under test
import {
  IStorageProvider,
  LocalStorageProvider,
  S3StorageProvider,
  getStorageProvider,
} from '../../server/utils/storage.js';

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------
describe('LocalStorageProvider', () => {
  let tmpDir: string;
  let provider: LocalStorageProvider;

  beforeEach(async () => {
    // Use a temp directory so we don't pollute public/images/uploads
    tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'storage-test-'));
    provider = new LocalStorageProvider(tmpDir);
  });

  afterEach(async () => {
    // Clean up temp directory
    await fs.rm(tmpDir, { recursive: true, force: true });
  });

  it('implements IStorageProvider interface', () => {
    const p: IStorageProvider = provider;
    expect(typeof p.upload).toBe('function');
    expect(typeof p.delete).toBe('function');
    expect(typeof p.getUrl).toBe('function');
  });

  describe('upload()', () => {
    it('returns a URL path starting with /images/uploads/', async () => {
      const buf = Buffer.from('hello world');
      const result = await provider.upload(buf, 'test.txt', 'text/plain');
      expect(result).toMatch(/^\/images\/uploads\//);
    });

    it('generates a unique filename (uuid-based) with the correct extension', async () => {
      const buf = Buffer.from('data');
      const result = await provider.upload(buf, 'photo.jpg', 'image/jpeg');
      expect(result).toMatch(/\.jpg$/);
      // Should NOT be the original filename (uuid replaces it)
      expect(result).not.toContain('photo.jpg');
    });

    it('writes the file to disk', async () => {
      const content = 'file content here';
      const buf = Buffer.from(content);
      const urlPath = await provider.upload(buf, 'doc.txt', 'text/plain');
      const filename = path.basename(urlPath);
      const diskPath = path.join(tmpDir, filename);
      const written = await fs.readFile(diskPath);
      expect(written.toString()).toBe(content);
    });

    it('generates different filenames for concurrent uploads of same file', async () => {
      const buf = Buffer.from('same content');
      const [url1, url2] = await Promise.all([
        provider.upload(buf, 'file.png', 'image/png'),
        provider.upload(buf, 'file.png', 'image/png'),
      ]);
      expect(url1).not.toBe(url2);
    });

    it('preserves the file extension from the original filename', async () => {
      const buf = Buffer.from('gif data');
      const result = await provider.upload(buf, 'animation.gif', 'image/gif');
      expect(result).toMatch(/\.gif$/);
    });

    it('handles filenames with no extension', async () => {
      const buf = Buffer.from('no ext');
      const result = await provider.upload(buf, 'noextfile', 'application/octet-stream');
      expect(result).toMatch(/^\/images\/uploads\//);
      // No trailing dot
      expect(result).not.toMatch(/\.$/);
    });
  });

  describe('delete()', () => {
    it('removes the file from disk', async () => {
      const buf = Buffer.from('to be deleted');
      const urlPath = await provider.upload(buf, 'del.txt', 'text/plain');
      const filename = path.basename(urlPath);
      const diskPath = path.join(tmpDir, filename);

      // Verify it exists first
      await expect(fs.access(diskPath)).resolves.toBeUndefined();

      await provider.delete(urlPath);

      // Verify it's gone
      await expect(fs.access(diskPath)).rejects.toThrow();
    });

    it('does not throw if the file does not exist', async () => {
      await expect(
        provider.delete('/images/uploads/nonexistent-file.jpg')
      ).resolves.toBeUndefined();
    });
  });

  describe('getUrl()', () => {
    it('returns the path as-is (for static serving)', async () => {
      const buf = Buffer.from('data');
      const urlPath = await provider.upload(buf, 'img.png', 'image/png');
      expect(provider.getUrl(urlPath)).toBe(urlPath);
    });

    it('returns arbitrary paths unchanged', () => {
      const p = '/images/uploads/some-uuid.jpg';
      expect(provider.getUrl(p)).toBe(p);
    });
  });
});

// ---------------------------------------------------------------------------
// S3StorageProvider
// ---------------------------------------------------------------------------
describe('S3StorageProvider', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
    process.env.S3_BUCKET = 'test-bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'AKIATEST';
    process.env.AWS_SECRET_ACCESS_KEY = 'secretkey';
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('implements IStorageProvider interface', () => {
    const provider: IStorageProvider = new S3StorageProvider();
    expect(typeof provider.upload).toBe('function');
    expect(typeof provider.delete).toBe('function');
    expect(typeof provider.getUrl).toBe('function');
  });

  it('reads S3_BUCKET from env', () => {
    const provider = new S3StorageProvider();
    expect(provider.bucket).toBe('test-bucket');
  });

  it('reads S3_REGION from env', () => {
    const provider = new S3StorageProvider();
    expect(provider.region).toBe('us-east-1');
  });

  it('upload returns a Promise', async () => {
    const provider = new S3StorageProvider();
    const buf = Buffer.from('data');
    const result = provider.upload(buf, 'file.jpg', 'image/jpeg');
    expect(result).toBeInstanceOf(Promise);
    // Stub returns something (a string)
    await expect(result).resolves.toEqual(expect.any(String));
  });

  it('delete returns a Promise', async () => {
    const provider = new S3StorageProvider();
    const result = provider.delete('s3://test-bucket/file.jpg');
    expect(result).toBeInstanceOf(Promise);
    await expect(result).resolves.toBeUndefined();
  });

  it('getUrl returns a string', () => {
    const provider = new S3StorageProvider();
    const url = provider.getUrl('s3://test-bucket/file.jpg');
    expect(typeof url).toBe('string');
  });
});

// ---------------------------------------------------------------------------
// getStorageProvider factory
// ---------------------------------------------------------------------------
describe('getStorageProvider()', () => {
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    originalEnv = { ...process.env };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('returns LocalStorageProvider when STORAGE_PROVIDER is not set', () => {
    delete process.env.STORAGE_PROVIDER;
    const provider = getStorageProvider();
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('returns LocalStorageProvider when STORAGE_PROVIDER=local', () => {
    process.env.STORAGE_PROVIDER = 'local';
    const provider = getStorageProvider();
    expect(provider).toBeInstanceOf(LocalStorageProvider);
  });

  it('returns S3StorageProvider when STORAGE_PROVIDER=s3', () => {
    process.env.STORAGE_PROVIDER = 's3';
    process.env.S3_BUCKET = 'bucket';
    process.env.S3_REGION = 'us-east-1';
    process.env.AWS_ACCESS_KEY_ID = 'key';
    process.env.AWS_SECRET_ACCESS_KEY = 'secret';
    const provider = getStorageProvider();
    expect(provider).toBeInstanceOf(S3StorageProvider);
  });

  it('returned provider satisfies IStorageProvider interface', () => {
    delete process.env.STORAGE_PROVIDER;
    const provider: IStorageProvider = getStorageProvider();
    expect(typeof provider.upload).toBe('function');
    expect(typeof provider.delete).toBe('function');
    expect(typeof provider.getUrl).toBe('function');
  });
});
