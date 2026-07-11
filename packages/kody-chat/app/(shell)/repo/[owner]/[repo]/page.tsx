/**
 * @fileType page
 * @domain kody-chat
 * @pattern chat-home
 * @ai-summary Repo-scoped chat home (`/repo/<owner>/<repo>`). This used to be
 *   served through the next.config rewrite to `/`, but on Vercel the client
 *   router's RSC request for a rewritten URL whose destination is the
 *   prerendered root returns 500, so sidebar navigation to the chat home fell
 *   back to a full-page load (chat remounted, conversation state flashed
 *   away). A real route inside the (shell) group keeps the navigation soft
 *   and the shared ChatShell instance alive; the rewrite still covers
 *   `/repo/<owner>/<repo>/<page>` subpaths.
 */
export default function RepoScopedChatHomePage() {
  return null;
}
