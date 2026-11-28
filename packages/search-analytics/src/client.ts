import { CLIENT_POLICY } from "./client-policy.ts";
import type { SearchEvent } from "./contracts.ts";

export type ClientSearchEvent = SearchEvent;
type Trigger = ClientSearchEvent["trigger"];
/** Browser-only state machine. It never reads storage, identity, or the search index. */
export function createSearchCollector(options: {
  enabled: boolean;
  debounceMs?: number;
  send: (event: ClientSearchEvent) => void;
  now?: () => number;
}) {
  const now = options.now ?? Date.now;
  let generation = 0;
  let delay = options.debounceMs ?? CLIENT_POLICY.debounceMs;
  let composing = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let candidate:
    | {
        generation: number;
        started: number;
        event: ClientSearchEvent;
        settled: boolean;
        sent: boolean;
      }
    | undefined;
  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
  };
  const flush = () => {
    cancel();
    if (!options.enabled || composing || !candidate?.settled || candidate.sent) return;
    candidate.sent = true;
    options.send(candidate.event);
  };
  return {
    begin(
      keyword: string,
      trigger: Trigger,
      locale: ClientSearchEvent["locale"],
      suppress = false,
    ) {
      cancel();
      generation++;
      candidate = undefined;
      const length = [...keyword.trim()].length;
      if (
        options.enabled &&
        !composing &&
        !suppress &&
        length >= CLIENT_POLICY.keywordMin &&
        length <= CLIENT_POLICY.keywordMax
      ) {
        candidate = {
          generation,
          started: now(),
          settled: false,
          sent: false,
          event: {
            version: 1,
            eventId: crypto.randomUUID(),
            keyword: keyword.trim(),
            trigger,
            locale,
            reportedResult: "zero",
          },
        };
      }
      return generation;
    },
    settled(id: number, hasResults: boolean) {
      if (!candidate || candidate.generation !== id || composing || candidate.sent) return;
      candidate.settled = true;
      candidate.event.reportedResult = hasResults ? "results" : "zero";
      cancel();
      timer = setTimeout(flush, Math.max(0, delay - (now() - candidate.started)));
    },
    select() {
      flush();
    },
    isCurrent(event: ClientSearchEvent) {
      return candidate?.event.eventId === event.eventId;
    },
    setDebounceMs(ms: number) {
      if (
        Number.isInteger(ms) &&
        ms >= CLIENT_POLICY.minimumDelay &&
        ms <= CLIENT_POLICY.maximumDelay
      )
        delay = ms;
    },
    composition(active: boolean) {
      composing = active;
      cancel();
      candidate = undefined;
      generation++;
    },
    invalidate() {
      cancel();
      candidate = undefined;
      generation++;
    },
    dispose() {
      cancel();
      candidate = undefined;
    },
  };
}
