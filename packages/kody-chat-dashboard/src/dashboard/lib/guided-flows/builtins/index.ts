import type { GuidedFlowDefinition } from "../controller";
import { CREATE_WORKFLOW_FLOW } from "./create-workflow";
import { ONBOARDING_FLOW } from "./onboarding";

export { CREATE_WORKFLOW_FLOW_ID } from "./create-workflow";
export { ONBOARDING_FLOW_ID } from "./onboarding";

export const BUILTIN_GUIDED_FLOW_DEFINITIONS: readonly GuidedFlowDefinition[] =
  [ONBOARDING_FLOW, CREATE_WORKFLOW_FLOW];
