/**
 * @fileType api-endpoint
 * @domain client-chat
 * @pattern languages-api
 * @ai-summary Language registry API — thin re-export of the package-owned
 *   handlers (@kody-ade/kody-chat).
 */
export {
  GET,
  POST,
  dynamic,
  revalidate,
} from "@kody-ade/kody-chat/routes/kody/languages";
