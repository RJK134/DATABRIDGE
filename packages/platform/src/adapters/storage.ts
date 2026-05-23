/**
 * StorageAdapter — pluggable object store (Cloudflare R2, AWS S3, Azure Blob, OCI Object Storage)
 */
export interface StorageAdapter {
  /** Upload a file/object. Returns the storage key. */
  put(key: string, body: Buffer | ReadableStream, opts?: PutOptions): Promise<string>;

  /** Download a file/object. Returns null if not found. */
  get(key: string): Promise<Buffer | null>;

  /** Delete a file/object. */
  delete(key: string): Promise<void>;

  /** Generate a pre-signed URL valid for `ttlSeconds`. */
  presign(key: string, ttlSeconds: number): Promise<string>;

  /** List objects under a prefix. */
  list(prefix: string): Promise<StorageObject[]>;
}

export interface PutOptions {
  contentType?: string;
  metadata?: Record<string, string>;
  /** Server-side encryption key alias */
  sseKeyId?: string;
}

export interface StorageObject {
  key: string;
  size: number;
  lastModified: Date;
  etag?: string;
}
