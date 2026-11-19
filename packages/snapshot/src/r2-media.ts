import { GetObjectCommand, NoSuchKey, S3Client } from "@aws-sdk/client-s3";

/** Build-time source, deliberately independent of the public media domain and its WAF. */
export function createR2MediaReader(env: NodeJS.ProcessEnv = process.env) {
  function required(name: string) {
    const value = env[name];
    if (!value) throw new Error(`R2 snapshot requires ${name}`);
    return value;
  }
  const accountId = required("CLOUDFLARE_ACCOUNT_ID");
  if (!/^[a-f0-9]{32}$/i.test(accountId)) throw new Error("Invalid CLOUDFLARE_ACCOUNT_ID");
  const bucket = env.R2_BUCKET ?? "tgbox-media";
  const client = new S3Client({
    endpoint: `https://${accountId}.r2.cloudflarestorage.com`,
    region: "auto",
    forcePathStyle: true,
    credentials: {
      accessKeyId: required("R2_ACCESS_KEY_ID"),
      secretAccessKey: required("R2_SECRET_ACCESS_KEY"),
    },
    maxAttempts: 3,
    retryMode: "standard",
    requestHandler: { connectionTimeout: 5_000, socketTimeout: 15_000 },
  });
  const stats = { requested: 0, found: 0, missing: 0, bytes: 0 };
  return {
    stats,
    close: () => client.destroy(),
    async read(key: string): Promise<unknown> {
      if (!/^(posts|history)\/[A-Za-z0-9_]+\.json$/.test(key)) {
        throw new Error(`Unexpected snapshot media key: ${key}`);
      }
      stats.requested++;
      try {
        const object = await client.send(new GetObjectCommand({ Bucket: bucket, Key: key }), {
          abortSignal: AbortSignal.timeout(45_000),
        });
        if (!object.Body) throw new Error("Empty R2 response body");
        const bytes = await object.Body.transformToByteArray();
        stats.bytes += bytes.byteLength;
        const value: unknown = JSON.parse(new TextDecoder().decode(bytes));
        stats.found++;
        return value;
      } catch (error) {
        if (error instanceof NoSuchKey) {
          stats.missing++;
          return undefined;
        }
        // Do not print signed requests, credentials or response bodies in CI logs.
        const reason = error instanceof Error ? error.name : "UnknownError";
        throw new Error(`R2 snapshot read failed for ${key}: ${reason}`);
      }
    },
  };
}
