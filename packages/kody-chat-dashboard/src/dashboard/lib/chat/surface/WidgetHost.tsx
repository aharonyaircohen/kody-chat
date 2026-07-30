/**
 * @fileType component
 * @domain widgets
 * @pattern widget-host
 * @ai-summary Mounts a tenant-published widget bundle inside a rendered
 *   view: dynamic-imports `/api/kody/widgets/<slug>` (auth via query params
 *   from the existing auth context) and calls the module's default export
 *   with data, theme, scoped CMS operations, reply, and complete.
 *   Shows a graceful "widget unavailable" box when loading or mounting
 *   fails. No tenant code ever runs on the server — browser-only.
 */
"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { buildAuthHeaders, useAuth } from "../../auth-context";
import { useTheme } from "../../../providers/Theme";
import {
  buildWidgetBundleUrl,
  createWidgetCmsClient,
  normalizeWidgetReply,
  resolveWidgetMount,
  type WidgetMountProps,
} from "./widget-host";

/**
 * Indirect dynamic import so bundlers (webpack/turbopack) leave the
 * runtime-only URL alone instead of trying to resolve it at build time.
 */
const importWidgetModule = new Function("url", "return import(url);") as (
  url: string,
) => Promise<unknown>;

type WidgetHostStatus = "loading" | "ready" | "error";

export function WidgetHost({
  slug,
  data,
  disabled,
  onComplete,
  onReply,
}: {
  slug: string;
  data: unknown;
  disabled: boolean;
  onComplete: WidgetMountProps["complete"];
  onReply: WidgetMountProps["reply"];
}) {
  const { auth } = useAuth();
  const { theme } = useTheme();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [status, setStatus] = useState<WidgetHostStatus>("loading");

  // Latest-value refs so the mounted widget's `complete` respects the
  // card's current disabled state without remounting the bundle.
  const onCompleteRef = useRef(onComplete);
  onCompleteRef.current = onComplete;
  const onReplyRef = useRef(onReply);
  onReplyRef.current = onReply;
  const disabledRef = useRef(disabled);
  disabledRef.current = disabled;

  const owner = auth?.owner;
  const repo = auth?.repo;
  const token = auth?.token;
  const cmsAuthHeaders = useMemo(() => buildAuthHeaders(auth), [auth]);
  const resolvedTheme: "dark" | "light" = theme === "light" ? "light" : "dark";

  useEffect(() => {
    const element = containerRef.current;
    if (!element) return;
    if (!owner || !repo || !token) {
      setStatus("error");
      return;
    }
    let cancelled = false;
    let cleanup: (() => void) | undefined;
    setStatus("loading");
    importWidgetModule(buildWidgetBundleUrl(slug, { owner, repo, token }))
      .then((module) => {
        if (cancelled) return;
        const mount = resolveWidgetMount(module);
        if (!mount) {
          // eslint-disable-next-line no-console -- widget bundle failures need browser diagnostics.
          console.error(
            `[WidgetHost] bundle for "${slug}" has no default mount(element, props) export`,
          );
          setStatus("error");
          return;
        }
        const result = mount(element, {
          data,
          theme: resolvedTheme,
          cms: createWidgetCmsClient(cmsAuthHeaders),
          reply: (message) => {
            if (disabledRef.current) return;
            const normalized = normalizeWidgetReply(message);
            if (normalized) onReplyRef.current(normalized);
          },
          complete: (actionId, actionResult) => {
            if (disabledRef.current) return;
            onCompleteRef.current(actionId, actionResult);
          },
        });
        if (typeof result === "function") cleanup = result;
        setStatus("ready");
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        // eslint-disable-next-line no-console -- widget bundle failures need browser diagnostics.
        console.error(`[WidgetHost] failed to load widget "${slug}"`, error);
        setStatus("error");
      });
    return () => {
      cancelled = true;
      try {
        cleanup?.();
      } catch (error) {
        // eslint-disable-next-line no-console -- third-party cleanup failures need browser diagnostics.
        console.error(`[WidgetHost] cleanup failed for "${slug}"`, error);
      }
      element.replaceChildren();
    };
  }, [slug, data, owner, repo, token, resolvedTheme, cmsAuthHeaders]);

  if (status === "error") {
    return (
      <div
        role="alert"
        className="rounded-md border border-amber-500/40 bg-amber-500/10 px-3 py-2 text-xs text-amber-500"
      >
        Widget unavailable
      </div>
    );
  }
  return (
    <div data-widget-slug={slug}>
      {status === "loading" ? (
        <div className="text-xs text-muted-foreground">Loading widget…</div>
      ) : null}
      <div ref={containerRef} />
    </div>
  );
}
