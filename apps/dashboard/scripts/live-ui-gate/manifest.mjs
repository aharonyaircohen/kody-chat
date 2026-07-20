export const LIVE_UI_JOURNEYS = Object.freeze([
  {
    id: "engine-chat-visible-reply",
    file: "tests/e2e/chat-real-system.spec.ts",
    title: "UI send → engine reply committed to target repo within 2 min",
  },
  {
    id: "brain-terminal-live-input",
    file: "tests/e2e/chat-terminal-live-ui.spec.ts",
    title:
      "selects Brain, keeps xterm visible, and accepts input after the stall window",
  },
  {
    id: "guided-flows-real-definitions",
    file: "tests/e2e/guided-flows-real.e2e.spec.ts",
    title: "loads real Guided Flow definitions",
  },
  {
    id: "guided-flows-real-persistence",
    file: "tests/e2e/guided-flows-real.e2e.spec.ts",
    title: "creates, completes, persists, and cleans up a real custom flow",
  },
  {
    id: "vibe-real-execution",
    file: "tests/e2e/vibe-live-full-flow.spec.ts",
    title: "rename welcome text → approve → runner pushes the real diff",
  },
  {
    id: "view-renderers-real-data",
    file: "tests/e2e/view-renderers-real.e2e.spec.ts",
    title: "shows built-in renderers in the real management page",
  },
]);

export const LIVE_UI_SPECS = Object.freeze([
  ...new Set(LIVE_UI_JOURNEYS.map((journey) => journey.file)),
]);

export const EXPECTED_LIVE_UI_TESTS = LIVE_UI_JOURNEYS.length;

// Required product journeys that do not yet have complete live UI proof.
// Keep these visible so the master gate cannot be mistaken for full coverage.
export const MISSING_LIVE_UI_JOURNEYS = Object.freeze([
  "authentication-and-repository-selection",
  "direct-kody-chat",
  "brain-chat",
  "conversation-persistence",
  "attachments",
  "rendered-views-and-approvals",
  "commands-and-context",
  "agent-and-model-selection",
  "client-branded-chat",
  "navigation-and-plugin-panels",
  "mobile",
]);
