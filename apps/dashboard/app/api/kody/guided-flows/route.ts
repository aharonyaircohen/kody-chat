/**
 * Dashboard host adapter for the package-owned GuidedFlow API.
 * The chat package owns the contract; each host must expose the route where
 * the shared KodyChat component makes its requests.
 */
export {
  GET,
  POST,
} from "@kody-ade/kody-chat-dashboard/routes/guided-flows";
