import type { GuidedFlowDefinition } from "../controller";
import { CREATE_WORKFLOW_FLOW } from "./create-workflow";
import { INITIALIZE_KODY_ENGINE_FLOW } from "./initialize-kody-engine";
import { ONBOARDING_FLOW, ONBOARDING_FLOW_V1 } from "./onboarding";

export { CREATE_WORKFLOW_FLOW_ID } from "./create-workflow";
export { INITIALIZE_KODY_ENGINE_FLOW_ID } from "./initialize-kody-engine";
export { ONBOARDING_FLOW_ID } from "./onboarding";

export const BUILTIN_GUIDED_FLOW_DEFINITIONS: readonly GuidedFlowDefinition[] =
  [
    ONBOARDING_FLOW_V1,
    ONBOARDING_FLOW,
    INITIALIZE_KODY_ENGINE_FLOW,
    CREATE_WORKFLOW_FLOW,
  ];
