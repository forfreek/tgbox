import { type ClientSearchEvent, createSearchCollector } from "@tgbox/search-analytics/client";
import { useEffect, useMemo, useRef, useState } from "react";
import { telegramInitData } from "@/components/app/telegram.ts";

export type SearchChallenge = {
  siteKey: string;
  context: string;
  action: string;
  complete: (token: string) => void;
};
/** The collector is independent of Pagefind's cache and 200ms search debounce. */
export function useSearchAnalytics(enabled: boolean, source: "website" | "miniapp") {
  const [challenge, setChallenge] = useState<SearchChallenge | null>(null);
  const sendRef = useRef<(event: ClientSearchEvent) => void>(() => undefined);
  const collector = useMemo(
    () => createSearchCollector({ enabled, send: (e) => sendRef.current(e) }),
    [enabled],
  );
  useEffect(() => {
    const endpoint = source === "website" ? "/api/search-event" : "/api/app/search-event";
    const send = async (event: ClientSearchEvent, retried = false): Promise<void> => {
      if (!collector.isCurrent(event)) return;
      const initData = source === "miniapp" ? telegramInitData() : null;
      if (source === "miniapp" && !initData) return;
      try {
        const response = await fetch(endpoint, {
          method: "POST",
          credentials: "same-origin",
          keepalive: true,
          headers: {
            "Content-Type": "application/json",
            ...(initData ? { "X-Telegram-Init-Data": initData } : {}),
          },
          body: JSON.stringify(event),
        });
        if (!collector.isCurrent(event)) return;
        const body: unknown = await response.json();
        if (
          typeof body === "object" &&
          body &&
          "debounceMs" in body &&
          typeof body.debounceMs === "number"
        )
          collector.setDebounceMs(body.debounceMs);
        if (source !== "website" || response.status !== 403 || retried) return;
        if (
          typeof body !== "object" ||
          !body ||
          !("status" in body) ||
          body.status !== "challenge" ||
          !("siteKey" in body) ||
          typeof body.siteKey !== "string" ||
          !("context" in body) ||
          typeof body.context !== "string" ||
          !("action" in body) ||
          typeof body.action !== "string"
        )
          return;
        setChallenge({
          siteKey: body.siteKey,
          context: body.context,
          action: body.action,
          complete: (token) => {
            setChallenge(null);
            if (!collector.isCurrent(event)) return;
            void (async () => {
              try {
                const verified = await fetch("/api/search-verify", {
                  method: "POST",
                  credentials: "same-origin",
                  headers: { "Content-Type": "application/json", "X-Turnstile-Token": token },
                  body: "{}",
                });
                if (verified.ok && collector.isCurrent(event)) await send(event, true);
              } catch {
                console.warn("search-analytics", "verification");
              }
            })();
          },
        });
      } catch {
        console.warn("search-analytics", "transport");
      }
    };
    sendRef.current = (event) => {
      void send(event);
    };
    return () => {
      collector.dispose();
      sendRef.current = () => undefined;
    };
  }, [collector, source]);
  return { collector, challenge, clearChallenge: () => setChallenge(null) };
}
