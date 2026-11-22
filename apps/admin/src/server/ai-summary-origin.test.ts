import { expect, test } from "vitest";
import { summaryWriteOriginAllowed } from "./ai-summary-origin.ts";

test.each([
  ["https://admin.example.com", true],
  ["https://evil.example.com", false],
  ["http://admin.example.com", false],
  ["https://admin.example.com:8443", false],
  ["null", false],
  ["https://admin.example.com/path", false],
  [undefined, false],
])("summary mutation origin %s: %s", (origin, allowed) => {
  const request = new Request("https://admin.example.com/_server", {
    method: "POST",
    headers: origin ? { Origin: origin } : {},
  });
  expect(summaryWriteOriginAllowed(request)).toBe(allowed);
});
test("read requests cannot use summary mutation middleware", () => {
  expect(
    summaryWriteOriginAllowed(
      new Request("https://admin.example.com/_server", {
        headers: { Origin: "https://admin.example.com" },
      }),
    ),
  ).toBe(false);
});
