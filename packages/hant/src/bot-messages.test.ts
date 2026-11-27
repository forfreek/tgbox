import { readFileSync } from "node:fs";
import { expect, test, vi } from "vitest";
import { botHantSource, botPaths } from "./bot-messages.ts";

test("the bot's Traditional dictionary is up to date with zh.ts (pnpm --filter @tgbox/hant gen:bot)", () => {
  expect(readFileSync(botPaths.hant, "utf8").replace(/\r\n?/g, "\n")).toBe(
    botHantSource(readFileSync(botPaths.zh, "utf8")),
  );
});

test("generation is independent of checkout line endings and locale collation", () => {
  const source = 'export const zh = { hello: "频道" };\n';
  const collation = vi.spyOn(String.prototype, "localeCompare").mockImplementation(() => {
    throw new Error("Host locale must not choose generated source order");
  });
  try {
    const generated = botHantSource(source);
    expect(botHantSource(source.replaceAll("\n", "\r\n"))).toBe(generated);
    const names = JSON.parse(
      generated
        .split("export const hantNames: Record<string, string> = ")[1]
        ?.trim()
        .slice(0, -1) ?? "{}",
    );
    expect(Object.keys(names)).toEqual(Object.keys(names).sort());
  } finally {
    collation.mockRestore();
  }
});

test("the generated dictionary exports only the Traditional messages and the name map", () => {
  const source = botHantSource(
    'export type Summary = { title: string };\nexport const utcTime = (ms: number) => "时间";\nexport const zh = {\n  hello: "你好，频道",\n};\n',
  );
  expect(source).toContain(
    'type Summary = { title: string };\nconst utcTime = (ms: number) => "時間";',
  );
  expect(source).toContain('export const zhHant = {\n  hello: "你好，頻道",\n};');
  expect(source).toMatch(
    /export const hantNames: Record<string, string> = \{[^}]*"资讯新闻": "資訊新聞"/,
  );
});
