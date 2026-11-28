import { useEffect, useRef } from "react";
import type { SearchChallenge as Challenge } from "@/lib/use-search-analytics.ts";

type Turnstile = {
  render(
    element: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      cData: string;
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
    },
  ): string;
  remove(id: string): void;
};
let loading: Promise<Turnstile> | undefined;
function loadWidget() {
  loading ??= new Promise<Turnstile>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = () => {
      const widget: unknown = Reflect.get(window, "turnstile");
      if (
        typeof widget === "object" &&
        widget &&
        "render" in widget &&
        typeof widget.render === "function" &&
        "remove" in widget &&
        typeof widget.remove === "function"
      )
        resolve(widget as Turnstile);
      else reject(new Error("Widget unavailable"));
    };
    script.onerror = () => reject(new Error("Widget unavailable"));
    document.head.appendChild(script);
  });
  return loading;
}
/** Loaded only after a server challenge. Failure never disables search controls. */
export function SearchChallenge({ challenge }: { challenge: Challenge | null }) {
  const target = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!challenge) return;
    let disposed = false;
    let cleanup: (() => void) | undefined;
    void loadWidget()
      .then((widget) => {
        if (disposed || !target.current) return;
        const id = widget.render(target.current, {
          sitekey: challenge.siteKey,
          action: challenge.action,
          cData: challenge.context,
          callback: (token) => {
            if (!disposed) challenge.complete(token);
          },
          "error-callback": () => console.warn("search-analytics", "turnstile"),
          "expired-callback": () => console.warn("search-analytics", "turnstile-expired"),
        });
        cleanup = () => widget.remove(id);
      })
      .catch(() => console.warn("search-analytics", "turnstile"));
    return () => {
      disposed = true;
      cleanup?.();
    };
  }, [challenge]);
  return challenge ? <div ref={target} className="px-4 py-2" /> : null;
}
