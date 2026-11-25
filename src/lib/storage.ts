import { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "./db";

/**
 * File storage. Drivers (STORAGE_DRIVER):
 *  - "spaces"   DigitalOcean Spaces / any S3-compatible bucket (production). Private objects, short-lived signed URLs.
 *  - "database" bytes in the StoredFile table — for free hosting with no object storage and an ephemeral disk.
 *  - "local"    LOCAL_UPLOAD_DIR (default ./.uploads) — local development only.
 * Default: "spaces" when SPACES_KEY/SECRET/BUCKET are set, otherwise "local".
 */
const spacesConfigured = Boolean(process.env.SPACES_KEY && process.env.SPACES_SECRET && process.env.SPACES_BUCKET);
const driver = ((process.env.STORAGE_DRIVER || undefined) as "spaces" | "database" | "local" | undefined) ?? (spacesConfigured ? "spaces" : "local");
const useSpaces = driver === "spaces";
const useDb = driver === "database";
if (useSpaces && !spacesConfigured) throw new Error("STORAGE_DRIVER=spaces requires SPACES_KEY, SPACES_SECRET and SPACES_BUCKET");
const localDir = process.env.LOCAL_UPLOAD_DIR || path.join(process.cwd(), ".uploads");

let client: S3Client | null = null;
function s3() {
  if (!client) {
    client = new S3Client({
      endpoint: process.env.SPACES_ENDPOINT,
      region: process.env.SPACES_REGION ?? "sgp1",
      credentials: { accessKeyId: process.env.SPACES_KEY!, secretAccessKey: process.env.SPACES_SECRET! },
      forcePathStyle: false,
    });
  }
  return client;
}

export const MAX_UPLOAD_BYTES = 15 * 1024 * 1024;
export const ALLOWED_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.ms-excel",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "text/csv",
];

export function storageKey(prefix: string, fileName: string) {
  const safe = fileName.replace(/[^a-zA-Z0-9._-]/g, "_").slice(-100);
  const d = new Date();
  return `${prefix}/${d.getUTCFullYear()}/${String(d.getUTCMonth() + 1).padStart(2, "0")}/${randomUUID()}-${safe}`;
}

export async function putObject(key: string, body: Buffer, contentType: string) {
  if (useSpaces) {
    await s3().send(new PutObjectCommand({ Bucket: process.env.SPACES_BUCKET, Key: key, Body: body, ContentType: contentType, ACL: "private" }));
    return;
  }
  if (useDb) {
    await prisma.storedFile.create({ data: { key, contentType, size: body.length, data: new Uint8Array(body) } });
    return;
  }
  const full = path.join(localDir, key);
  await fs.mkdir(path.dirname(full), { recursive: true });
  await fs.writeFile(full, body);
}

/** Signed URL valid for `expiresIn` seconds (default 5 minutes). Returns null for local storage. */
export async function signedDownloadUrl(key: string, fileName: string, expiresIn = 300): Promise<string | null> {
  if (!useSpaces) return null;
  return getSignedUrl(
    s3(),
    new GetObjectCommand({ Bucket: process.env.SPACES_BUCKET, Key: key, ResponseContentDisposition: `attachment; filename="${fileName.replace(/"/g, "")}"` }),
    { expiresIn },
  );
}

/** Read bytes for the non-Spaces drivers (database or local disk). */
export async function readLocal(key: string): Promise<Buffer> {
  if (useDb) {
    const f = await prisma.storedFile.findUnique({ where: { key } });
    if (!f) throw new Error("File not found");
    return Buffer.from(f.data);
  }
  const full = path.resolve(localDir, key);
  if (!full.startsWith(path.resolve(localDir))) throw new Error("Invalid key");
  return fs.readFile(full);
}

export async function deleteObject(key: string) {
  if (useSpaces) await s3().send(new DeleteObjectCommand({ Bucket: process.env.SPACES_BUCKET, Key: key }));
  else if (useDb) await prisma.storedFile.deleteMany({ where: { key } });
  else await fs.rm(path.join(localDir, key), { force: true });
}

export const storageMode = driver;
