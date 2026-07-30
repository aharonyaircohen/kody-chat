import {
  RENDER_VIEW_DIRECTIVE,
  type RenderedViewDirective,
} from "../chat-ui-actions";

const WIDGET_SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/;
export const WIDGET_OPEN_EVENT = "kody:widget-open";
const GLOBAL_REQUEST_KEY = "__kodyWidgetOpenRequest";

export interface WidgetOpenRequest {
  widgetSlug: string;
}

let pendingRequest: WidgetOpenRequest | null = null;

export function isWidgetOpenRequest(
  value: unknown,
): value is WidgetOpenRequest {
  if (!value || typeof value !== "object") return false;
  const widgetSlug = (value as Record<string, unknown>).widgetSlug;
  return typeof widgetSlug === "string" && WIDGET_SLUG_RE.test(widgetSlug);
}

export function requestWidgetOpen(widgetSlug: string): void {
  const request = { widgetSlug };
  if (!isWidgetOpenRequest(request)) return;
  pendingRequest = request;
  (
    window as Window & {
      [GLOBAL_REQUEST_KEY]?: WidgetOpenRequest;
    }
  )[GLOBAL_REQUEST_KEY] = request;
  window.dispatchEvent(new CustomEvent(WIDGET_OPEN_EVENT, { detail: request }));
}

export function consumeWidgetOpenRequest(): WidgetOpenRequest | null {
  const globalWindow = window as Window & {
    [GLOBAL_REQUEST_KEY]?: WidgetOpenRequest;
  };
  const request = globalWindow[GLOBAL_REQUEST_KEY] ?? pendingRequest;
  delete globalWindow[GLOBAL_REQUEST_KEY];
  pendingRequest = null;
  return request;
}

export function buildWidgetPreviewView(
  widgetSlug: string,
  id = `widget-preview:${widgetSlug}`,
): RenderedViewDirective | null {
  if (!WIDGET_SLUG_RE.test(widgetSlug)) return null;
  return {
    action: RENDER_VIEW_DIRECTIVE,
    view: "renderer",
    id,
    rendererSlug: "widget-preview",
    rendererName: widgetSlug,
    resultTarget: "chat",
    ui: {
      type: "widget",
      widget: widgetSlug,
      preview: true,
    },
    data: {},
  };
}

/** True only for a widget launched directly by Kody's generic preview button. */
export function isWidgetPreviewView(
  view: RenderedViewDirective | null | undefined,
): boolean {
  return (
    view?.rendererSlug === "widget-preview" &&
    view.ui.type === "widget" &&
    view.ui.preview === true
  );
}
