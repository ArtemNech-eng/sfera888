import {
  S3Client,
  HeadObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  DeleteObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { Readable } from "stream";
import { randomUUID } from "crypto";
import {
  ObjectAclPolicy,
  ObjectPermission,
  canAccessObject,
  getObjectAclPolicy,
  setObjectAclPolicy,
} from "./objectAcl";

function getS3Client(): S3Client {
  const endpoint = process.env.R2_ENDPOINT;
  const accessKeyId = process.env.R2_ACCESS_KEY_ID;
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY;
  const region = process.env.R2_REGION || "auto";

  if (!endpoint || !accessKeyId || !secretAccessKey) {
    throw new Error(
      "R2 not configured. Set R2_ENDPOINT, R2_ACCESS_KEY_ID, and R2_SECRET_ACCESS_KEY env vars."
    );
  }

  return new S3Client({
    endpoint,
    region,
    credentials: { accessKeyId, secretAccessKey },
    forcePathStyle: true,
  });
}

export const s3Client = getS3Client();

export class ObjectNotFoundError extends Error {
  constructor() {
    super("Object not found");
    this.name = "ObjectNotFoundError";
    Object.setPrototypeOf(this, ObjectNotFoundError.prototype);
  }
}

export type R2ObjectRef = { bucketName: string; objectName: string };

export class ObjectStorageService {
  private s3 = s3Client;

  getPublicObjectSearchPaths(): Array<string> {
    const pathsStr = process.env.PUBLIC_OBJECT_SEARCH_PATHS || "";
    const paths = Array.from(
      new Set(
        pathsStr
          .split(",")
          .map((path) => path.trim())
          .filter((path) => path.length > 0)
      )
    );
    if (paths.length === 0) {
      throw new Error(
        "PUBLIC_OBJECT_SEARCH_PATHS not set. Set it to comma-separated bucket/object-prefix paths."
      );
    }
    return paths;
  }

  getPrivateObjectDir(): string {
    const dir = process.env.PRIVATE_OBJECT_DIR || "";
    if (!dir) {
      throw new Error(
        "PRIVATE_OBJECT_DIR not set. Set it to a bucket/object-prefix path."
      );
    }
    return dir;
  }

  async searchPublicObject(filePath: string): Promise<R2ObjectRef | null> {
    for (const searchPath of this.getPublicObjectSearchPaths()) {
      const fullPath = `${searchPath}/${filePath}`;
      const { bucketName, objectName } = parseObjectPath(fullPath);

      try {
        await this.s3.send(
          new HeadObjectCommand({ Bucket: bucketName, Key: objectName })
        );
        return { bucketName, objectName };
      } catch {
        // Object does not exist in this path
      }
    }
    return null;
  }

  async downloadObject(
    ref: R2ObjectRef,
    cacheTtlSec: number = 3600
  ): Promise<Response> {
    const command = new GetObjectCommand({
      Bucket: ref.bucketName,
      Key: ref.objectName,
    });

    const response = await this.s3.send(command);
    const contentType = response.ContentType || "application/octet-stream";
    const isPublic =
      (await getObjectAclPolicy(ref))?.visibility === "public";

    const headers: Record<string, string> = {
      "Content-Type": contentType,
      "Cache-Control": `${isPublic ? "public" : "private"}, max-age=${cacheTtlSec}`,
    };
    if (response.ContentLength) {
      headers["Content-Length"] = String(response.ContentLength);
    }

    const body = response.Body as ReadableStream;
    return new Response(body, { headers });
  }

  async getObjectEntityUploadURL(): Promise<string> {
    const privateObjectDir = this.getPrivateObjectDir();
    const objectId = randomUUID();
    const fullPath = `${privateObjectDir}/uploads/${objectId}`;
    const { bucketName, objectName } = parseObjectPath(fullPath);

    return signObjectURL({
      bucketName,
      objectName,
      method: "PUT",
      ttlSec: 900,
    });
  }

  async getObjectEntityFile(objectPath: string): Promise<R2ObjectRef> {
    if (!objectPath.startsWith("/objects/")) {
      throw new ObjectNotFoundError();
    }

    const parts = objectPath.slice(1).split("/");
    if (parts.length < 2) {
      throw new ObjectNotFoundError();
    }

    const entityId = parts.slice(1).join("/");
    let entityDir = this.getPrivateObjectDir();
    if (!entityDir.endsWith("/")) {
      entityDir = `${entityDir}/`;
    }
    const objectEntityPath = `${entityDir}${entityId}`;
    const { bucketName, objectName } = parseObjectPath(objectEntityPath);

    try {
      await this.s3.send(
        new HeadObjectCommand({ Bucket: bucketName, Key: objectName })
      );
      return { bucketName, objectName };
    } catch {
      throw new ObjectNotFoundError();
    }
  }

  normalizeObjectEntityPath(rawPath: string): string {
    const endpoint = process.env.R2_ENDPOINT || "";
    const publicUrl = process.env.R2_PUBLIC_URL || "";

    // Normalize R2 public URL or endpoint URL
    for (const prefix of [endpoint, publicUrl, "https://storage.googleapis.com"]) {
      if (!prefix) continue;
      if (rawPath.startsWith(prefix)) {
        const url = new URL(rawPath);
        const rawObjectPath = url.pathname;

        let objectEntityDir = this.getPrivateObjectDir();
        if (!objectEntityDir.endsWith("/")) {
          objectEntityDir = `${objectEntityDir}/`;
        }

        if (!rawObjectPath.startsWith(objectEntityDir)) {
          return rawObjectPath;
        }

        const entityId = rawObjectPath.slice(objectEntityDir.length);
        return `/objects/${entityId}`;
      }
    }

    return rawPath;
  }

  async trySetObjectEntityAclPolicy(
    rawPath: string,
    aclPolicy: ObjectAclPolicy
  ): Promise<string> {
    const normalizedPath = this.normalizeObjectEntityPath(rawPath);
    if (!normalizedPath.startsWith("/")) {
      return normalizedPath;
    }

    const objectRef = await this.getObjectEntityFile(normalizedPath);
    await setObjectAclPolicy(objectRef, aclPolicy);
    return normalizedPath;
  }

  async canAccessObjectEntity({
    userId,
    objectRef,
    requestedPermission,
  }: {
    userId?: string;
    objectRef: R2ObjectRef;
    requestedPermission?: ObjectPermission;
  }): Promise<boolean> {
    return canAccessObject({
      userId,
      objectRef,
      requestedPermission: requestedPermission ?? ObjectPermission.READ,
    });
  }
}

/**
 * Загружает фото комнаты пользователя в Object_Storage (R2) под ключом
 * `dizajn/uploads/{uuid}` и возвращает этот R2-ключ при успехе.
 *
 * Бросает при любом сбое стораджа (включая отсутствие конфигурации бакета).
 * Вызывающая сторона (`Generate_Endpoint`) ловит ошибку и деградирует к
 * `Text_To_Image_Mode` (Req 4.6), не отклоняя запрос.
 *
 * @param buf  бинарное содержимое фото
 * @param mime MIME-тип, уже провалидированный как JPG/PNG
 * @returns    R2-ключ загруженного объекта (`dizajn/uploads/{uuid}`)
 */
export async function uploadRoomPhoto(
  buf: Buffer,
  mime: "image/jpeg" | "image/png"
): Promise<string> {
  const bucketId = process.env.DEFAULT_OBJECT_STORAGE_BUCKET_ID;
  if (!bucketId) {
    throw new Error("DEFAULT_OBJECT_STORAGE_BUCKET_ID is not set");
  }

  const key = `dizajn/uploads/${randomUUID()}`;

  await s3Client.send(
    new PutObjectCommand({
      Bucket: bucketId,
      Key: key,
      Body: buf,
      ContentType: mime,
    })
  );

  return key;
}

export function parseObjectPath(path: string): {
  bucketName: string;
  objectName: string;
} {
  if (!path.startsWith("/")) {
    path = `/${path}`;
  }
  const pathParts = path.split("/");
  if (pathParts.length < 3) {
    throw new Error("Invalid path: must contain at least a bucket name");
  }

  const bucketName = pathParts[1];
  const objectName = pathParts.slice(2).join("/");

  return { bucketName, objectName };
}

export async function signObjectURL({
  bucketName,
  objectName,
  method,
  ttlSec,
}: {
  bucketName: string;
  objectName: string;
  method: "GET" | "PUT" | "DELETE" | "HEAD";
  ttlSec: number;
}): Promise<string> {
  const client = s3Client;
  const expiresIn = ttlSec;

  switch (method) {
    case "PUT": {
      const command = new PutObjectCommand({ Bucket: bucketName, Key: objectName });
      return getSignedUrl(client, command, { expiresIn });
    }
    case "GET": {
      const command = new GetObjectCommand({ Bucket: bucketName, Key: objectName });
      return getSignedUrl(client, command, { expiresIn });
    }
    case "DELETE": {
      const command = new DeleteObjectCommand({ Bucket: bucketName, Key: objectName });
      return getSignedUrl(client, command, { expiresIn });
    }
    case "HEAD": {
      const command = new HeadObjectCommand({ Bucket: bucketName, Key: objectName });
      return getSignedUrl(client, command, { expiresIn });
    }
    default:
      throw new Error(`Unsupported method: ${method}`);
  }
}

// Legacy export for direct use in routes that still import objectStorageClient
export const objectStorageClient = {
  bucket(bucketName: string) {
    return {
      file(objectName: string) {
        return new R2File(bucketName, objectName);
      },
    };
  },
};

class R2File {
  constructor(
    private bucketName: string,
    private objectName: string
  ) {}

  async save(buffer: Buffer, options?: { contentType?: string; resumable?: boolean }) {
    await s3Client.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: this.objectName,
        Body: buffer,
        ContentType: options?.contentType,
      })
    );
  }

  async delete(options?: { ignoreNotFound?: boolean }) {
    try {
      await s3Client.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: this.objectName,
        })
      );
    } catch {
      if (!options?.ignoreNotFound) throw new ObjectNotFoundError();
    }
  }

  async exists(): Promise<[boolean]> {
    try {
      await s3Client.send(
        new HeadObjectCommand({ Bucket: this.bucketName, Key: this.objectName })
      );
      return [true];
    } catch {
      return [false];
    }
  }

  get name() {
    return this.objectName;
  }
}
