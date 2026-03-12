/**
 * Storage Abstraction — IStorageProvider
 *
 * Provides a common interface for file storage backends.
 * Currently supports:
 *   - LocalStorageProvider: saves files to public/images/uploads/
 *   - S3StorageProvider:    stub for AWS S3 (TODO: implement with @aws-sdk)
 *
 * Factory:
 *   import { getStorageProvider } from './storage.js';
 *   const storage = getStorageProvider(); // respects STORAGE_PROVIDER env var
 *   const url = await storage.upload(buffer, 'photo.jpg', 'image/jpeg');
 */

import { promises as fs } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';

// ---------------------------------------------------------------------------
// Interface
// ---------------------------------------------------------------------------

/**
 * Common interface for all storage backends.
 */
export interface IStorageProvider {
  /**
   * Upload a file buffer and return the public URL/path.
   * @param file     - Raw file contents as a Buffer
   * @param filename - Original filename (used only for extension extraction)
   * @param mimeType - MIME type of the file (e.g. 'image/jpeg')
   * @returns        Public URL or relative path (e.g. '/images/uploads/<uuid>.jpg')
   */
  upload(file: Buffer, filename: string, mimeType: string): Promise<string>;

  /**
   * Delete a file by its URL/path returned from upload().
   * Must not throw if the file does not exist.
   */
  delete(fileUrl: string): Promise<void>;

  /**
   * Return the public-facing URL for a stored file.
   * For local storage this is the path itself; for S3 it would be the full HTTPS URL.
   */
  getUrl(fileUrl: string): string;
}

// ---------------------------------------------------------------------------
// LocalStorageProvider
// ---------------------------------------------------------------------------

/**
 * Stores files on the local filesystem under `uploadDir` (default:
 * `<project-root>/public/images/uploads`).  Files are served statically by
 * Express under the `/images/uploads/` URL prefix.
 *
 * Accepts an optional `uploadDir` constructor parameter so tests can redirect
 * writes to a temp directory without touching the real public folder.
 */
export class LocalStorageProvider implements IStorageProvider {
  readonly uploadDir: string;

  constructor(uploadDir?: string) {
    if (uploadDir !== undefined) {
      this.uploadDir = uploadDir;
    } else {
      // Default: <repo-root>/public/images/uploads
      const repoRoot = path.resolve(new URL(import.meta.url).pathname, '../../../');
      this.uploadDir = path.join(repoRoot, 'public', 'images', 'uploads');
    }
  }

  async upload(file: Buffer, filename: string, _mimeType: string): Promise<string> {
    const ext = path.extname(filename); // e.g. '.jpg' or ''
    const uniqueName = ext ? `${randomUUID()}${ext}` : randomUUID();
    const diskPath = path.join(this.uploadDir, uniqueName);

    // Ensure the directory exists (it should, but be defensive)
    await fs.mkdir(this.uploadDir, { recursive: true });
    await fs.writeFile(diskPath, file);

    return `/images/uploads/${uniqueName}`;
  }

  async delete(fileUrl: string): Promise<void> {
    const filename = path.basename(fileUrl);
    const diskPath = path.join(this.uploadDir, filename);
    try {
      await fs.unlink(diskPath);
    } catch (err: unknown) {
      // Ignore "file not found" errors; re-throw anything unexpected
      if (isNodeError(err) && err.code === 'ENOENT') return;
      throw err;
    }
  }

  getUrl(fileUrl: string): string {
    // Local files are served statically; the URL/path is used as-is.
    return fileUrl;
  }
}

// ---------------------------------------------------------------------------
// S3StorageProvider (stub)
// ---------------------------------------------------------------------------

/**
 * AWS S3 storage backend — currently stubbed.
 *
 * TODO: Install @aws-sdk/client-s3 and implement:
 *   - upload()  → PutObjectCommand
 *   - delete()  → DeleteObjectCommand
 *   - getUrl()  → construct https://<bucket>.s3.<region>.amazonaws.com/<key>
 *
 * Required env vars:
 *   S3_BUCKET              — target bucket name
 *   S3_REGION              — AWS region (e.g. 'us-east-1')
 *   AWS_ACCESS_KEY_ID      — AWS access key
 *   AWS_SECRET_ACCESS_KEY  — AWS secret key
 */
export class S3StorageProvider implements IStorageProvider {
  readonly bucket: string;
  readonly region: string;
  readonly accessKeyId: string;
  readonly secretAccessKey: string;

  constructor() {
    this.bucket = process.env.S3_BUCKET ?? '';
    this.region = process.env.S3_REGION ?? '';
    this.accessKeyId = process.env.AWS_ACCESS_KEY_ID ?? '';
    this.secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY ?? '';
  }

  async upload(
    _file: Buffer,
    _filename: string,
    _mimeType: string
  ): Promise<string> {
    // TODO: implement using @aws-sdk/client-s3 PutObjectCommand
    // const key = `uploads/${randomUUID()}${path.extname(_filename)}`;
    // await s3Client.send(new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: _file, ContentType: _mimeType }));
    // return this.getUrl(key);
    return '';
  }

  async delete(_fileUrl: string): Promise<void> {
    // TODO: implement using @aws-sdk/client-s3 DeleteObjectCommand
    // const key = new URL(_fileUrl).pathname.slice(1);
    // await s3Client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }

  getUrl(_fileUrl: string): string {
    // TODO: return https://<bucket>.s3.<region>.amazonaws.com/<key>
    return _fileUrl;
  }
}

// ---------------------------------------------------------------------------
// Factory
// ---------------------------------------------------------------------------

/**
 * Returns the configured storage provider.
 *
 * Reads `STORAGE_PROVIDER` env var:
 *   - 'local'  (default) → LocalStorageProvider
 *   - 's3'               → S3StorageProvider
 */
export function getStorageProvider(): IStorageProvider {
  const provider = process.env.STORAGE_PROVIDER ?? 'local';
  if (provider === 's3') {
    return new S3StorageProvider();
  }
  return new LocalStorageProvider();
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isNodeError(err: unknown): err is NodeJS.ErrnoException {
  return err instanceof Error && 'code' in err;
}
