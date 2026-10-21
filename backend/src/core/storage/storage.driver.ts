import { Logger } from '@nestjs/common';
import { promises as fs } from 'fs';
import * as path from 'path';
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from '@aws-sdk/client-s3';

/** Where file bytes live. Keys are generated server-side (`<tenant>/<yyyy>/<mm>/<uuid>`), never user input. */
export interface StorageDriver {
  readonly name: 'disk' | 's3';
  put(key: string, body: Buffer, contentType: string): Promise<void>;
  get(key: string): Promise<Buffer>;
  delete(key: string): Promise<void>;
}

const SAFE_KEY = /^[A-Za-z0-9._/-]+$/;

/** Local filesystem (single server / development). STORAGE_DISK_PATH defaults to ./storage. */
export class DiskStorageDriver implements StorageDriver {
  readonly name = 'disk' as const;
  private readonly root: string;

  constructor(root = process.env.STORAGE_DISK_PATH || path.join(process.cwd(), 'storage')) {
    this.root = path.resolve(root);
  }

  private resolve(key: string): string {
    if (!SAFE_KEY.test(key) || key.includes('..')) throw new Error(`Invalid storage key '${key}'`);
    const full = path.resolve(this.root, key);
    if (!full.startsWith(this.root + path.sep)) throw new Error('Storage key escapes the storage root');
    return full;
  }

  async put(key: string, body: Buffer): Promise<void> {
    const full = this.resolve(key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, body);
  }

  get(key: string): Promise<Buffer> {
    return fs.readFile(this.resolve(key));
  }

  async delete(key: string): Promise<void> {
    await fs.rm(this.resolve(key), { force: true });
  }
}

/**
 * Amazon S3 or any S3-compatible store (MinIO, Cloudflare R2, Wasabi...).
 * S3_BUCKET, S3_REGION, optional S3_ENDPOINT / S3_FORCE_PATH_STYLE, credentials from
 * S3_ACCESS_KEY_ID / S3_SECRET_ACCESS_KEY or the standard AWS credential chain.
 */
export class S3StorageDriver implements StorageDriver {
  readonly name = 's3' as const;
  private readonly client: S3Client;
  private readonly bucket: string;

  constructor() {
    const bucket = process.env.S3_BUCKET;
    if (!bucket) throw new Error('STORAGE_DRIVER=s3 requires S3_BUCKET');
    this.bucket = bucket;
    this.client = new S3Client({
      region: process.env.S3_REGION || 'us-east-1',
      endpoint: process.env.S3_ENDPOINT || undefined,
      forcePathStyle: process.env.S3_FORCE_PATH_STYLE === 'true',
      credentials:
        process.env.S3_ACCESS_KEY_ID && process.env.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: process.env.S3_ACCESS_KEY_ID, secretAccessKey: process.env.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }

  async put(key: string, body: Buffer, contentType: string): Promise<void> {
    await this.client.send(
      new PutObjectCommand({ Bucket: this.bucket, Key: key, Body: body, ContentType: contentType, ServerSideEncryption: 'AES256' }),
    );
  }

  async get(key: string): Promise<Buffer> {
    const res = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    if (!res.Body) throw new Error(`Object '${key}' has no body`);
    return Buffer.from(await res.Body.transformToByteArray());
  }

  async delete(key: string): Promise<void> {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket, Key: key }));
  }
}

export function createStorageDriver(): StorageDriver {
  const driver = (process.env.STORAGE_DRIVER || 'disk').toLowerCase();
  const instance = driver === 's3' ? new S3StorageDriver() : new DiskStorageDriver();
  new Logger('Storage').log(`File storage driver: ${instance.name}`);
  return instance;
}
