import { NoSuchKey, S3Client } from "@aws-sdk/client-s3";
import { afterEach, describe, expect, test, vi } from "vitest";
import { createR2MediaReader } from "./r2-media.ts";

const env = {
  CLOUDFLARE_ACCOUNT_ID: "a".repeat(32),
  R2_ACCESS_KEY_ID: "test-key",
  R2_SECRET_ACCESS_KEY: "test-secret",
};
afterEach(() => vi.restoreAllMocks());

describe("authenticated R2 snapshot input", () => {
  test("reads JSON with SDK GetObject, counts bytes and closes the client", async () => {
    const bytes = new TextEncoder().encode('[{"text":"中文"}]');
    const send = vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Body: { transformToByteArray: async () => bytes },
    } as never);
    const destroy = vi.spyOn(S3Client.prototype, "destroy");
    const source = createR2MediaReader(env);
    try {
      expect(await source.read("posts/test_channel.json")).toEqual([{ text: "中文" }]);
      expect(send.mock.calls[0]?.[0].input).toEqual({
        Bucket: "tgbox-media",
        Key: "posts/test_channel.json",
      });
      expect(source.stats).toEqual({ requested: 1, found: 1, missing: 0, bytes: bytes.length });
    } finally {
      source.close();
    }
    expect(destroy).toHaveBeenCalledOnce();
  });

  test("only NoSuchKey is a missing object; a missing bucket is fatal", async () => {
    const send = vi
      .spyOn(S3Client.prototype, "send")
      .mockRejectedValueOnce(
        new NoSuchKey({ message: "missing", $metadata: { httpStatusCode: 404 } }),
      )
      .mockRejectedValueOnce(Object.assign(new Error("missing bucket"), { name: "NoSuchBucket" }));
    const source = createR2MediaReader(env);
    try {
      expect(await source.read("history/test.json")).toBeUndefined();
      await expect(source.read("history/test.json")).rejects.toThrow("NoSuchBucket");
      expect(source.stats.missing).toBe(1);
      expect(send).toHaveBeenCalledTimes(2);
    } finally {
      source.close();
    }
  });

  test.each(["AccessDenied", "TimeoutError", "SlowDown"])(
    "fails closed on %s without exposing response details",
    async (name) => {
      vi.spyOn(S3Client.prototype, "send").mockRejectedValue(
        Object.assign(new Error("sensitive response or signed request"), { name }),
      );
      const source = createR2MediaReader(env);
      try {
        await expect(source.read("posts/test.json")).rejects.toThrow(
          `R2 snapshot read failed for posts/test.json: ${name}`,
        );
      } finally {
        source.close();
      }
    },
  );

  test("malformed JSON fails instead of turning into empty content", async () => {
    vi.spyOn(S3Client.prototype, "send").mockResolvedValue({
      Body: { transformToByteArray: async () => new TextEncoder().encode("not JSON") },
    } as never);
    const source = createR2MediaReader(env);
    try {
      await expect(source.read("posts/test.json")).rejects.toThrow("SyntaxError");
    } finally {
      source.close();
    }
  });

  test("requires credentials without falling back to public HTTP or AWS metadata", () => {
    expect(() => createR2MediaReader({ ...env, R2_SECRET_ACCESS_KEY: "" })).toThrow(
      "R2_SECRET_ACCESS_KEY",
    );
    expect(() => createR2MediaReader({ ...env, CLOUDFLARE_ACCOUNT_ID: "invalid" })).toThrow(
      "Invalid CLOUDFLARE_ACCOUNT_ID",
    );
  });

  test("rejects keys outside the snapshot JSON allowlist before I/O", async () => {
    const send = vi.spyOn(S3Client.prototype, "send");
    const source = createR2MediaReader(env);
    try {
      for (const key of ["avatars/test.jpg", "posts/../secret.json", "history/test.json?x=1"]) {
        await expect(source.read(key)).rejects.toThrow("Unexpected snapshot media key");
      }
      expect(send).not.toHaveBeenCalled();
    } finally {
      source.close();
    }
  });
});
