import type { PreviewAction, PreviewActResult } from "./protocol";

export type ViewsPreviewActionRunner = (
  action: PreviewAction,
) => Promise<PreviewActResult>;

let currentRunner: ViewsPreviewActionRunner | null = null;

export function getViewsPreviewActionRunner(): ViewsPreviewActionRunner | null {
  return currentRunner;
}

export function registerViewsPreviewActionRunner(
  runner: ViewsPreviewActionRunner | null,
): () => void {
  currentRunner = runner;
  return () => {
    if (currentRunner === runner) currentRunner = null;
  };
}
