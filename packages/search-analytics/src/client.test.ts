import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { createSearchCollector } from "./client.ts";

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());
function setup(enabled = true) {
  const send = vi.fn();
  return { send, c: createSearchCollector({ enabled, send }) };
}
test("independent debounce starts at input; quick result selection sends the same event once", () => {
  const { c, send } = setup();
  const id = c.begin("新闻", "manual", "zh");
  vi.advanceTimersByTime(200);
  c.settled(id, true);
  vi.advanceTimersByTime(100);
  expect(send).not.toHaveBeenCalled();
  c.select();
  c.select();
  vi.advanceTimersByTime(5000);
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ trigger: "manual", reportedResult: "results" });
});
test("stale asynchronous queries and superseded timers cannot report", () => {
  const { c, send } = setup();
  const old = c.begin("新闻", "manual", "zh");
  c.settled(old, true);
  const current = c.begin("科技", "manual", "zh");
  c.settled(old, true);
  vi.advanceTimersByTime(1500);
  expect(send).not.toHaveBeenCalled();
  c.settled(current, false);
  vi.runAllTimers();
  expect(send).toHaveBeenCalledTimes(1);
  expect(send.mock.calls[0]?.[0]).toMatchObject({ keyword: "科技", reportedResult: "zero" });
});
test("IME intermediate states, failures, preload, refresh prefill and disabled clients do not report", () => {
  const { c, send } = setup();
  c.composition(true);
  const id = c.begin("中文", "manual", "zh");
  c.settled(id, true);
  c.select();
  vi.runAllTimers();
  expect(send).not.toHaveBeenCalled();
  c.composition(false);
  c.begin("中文", "manual", "zh");
  vi.runAllTimers();
  expect(send).not.toHaveBeenCalled();
  const prefill = c.begin("中文", "prefill", "zh", true);
  c.settled(prefill, true);
  vi.runAllTimers();
  expect(send).not.toHaveBeenCalled();
  const disabled = setup(false);
  const d = disabled.c.begin("中文", "manual", "zh");
  disabled.c.settled(d, true);
  disabled.c.select();
  vi.runAllTimers();
  expect(disabled.send).not.toHaveBeenCalled();
});
test("trigger and result are separate; composition end with unchanged text creates a new candidate", () => {
  const { c, send } = setup();
  c.composition(true);
  c.composition(false);
  const id = c.begin("中文", "recommended", "zh-hant");
  c.settled(id, false);
  vi.advanceTimersByTime(1500);
  expect(send.mock.calls[0]?.[0]).toMatchObject({
    trigger: "recommended",
    reportedResult: "zero",
    locale: "zh-hant",
  });
  c.dispose();
  vi.runAllTimers();
  expect(send).toHaveBeenCalledTimes(1);
});
