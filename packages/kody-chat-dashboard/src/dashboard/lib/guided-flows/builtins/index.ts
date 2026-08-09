import type { GuidedFlowDefinition } from "../controller";
import { CREATE_WORKFLOW_FLOW } from "./create-workflow";
import { INITIALIZE_KODY_ENGINE_FLOW } from "./initialize-kody-engine";
import { SETUP_UI_LOGIN_FLOW } from "./setup-ui-login";
import {
  ONBOARDING_FLOW,
  ONBOARDING_FLOW_V1,
  ONBOARDING_FLOW_V2,
} from "./onboarding";

export { CREATE_WORKFLOW_FLOW_ID } from "./create-workflow";
export { INITIALIZE_KODY_ENGINE_FLOW_ID } from "./initialize-kody-engine";
export { ONBOARDING_FLOW_ID } from "./onboarding";
export { SETUP_UI_LOGIN_FLOW_ID } from "./setup-ui-login";

export const BUILTIN_GUIDED_FLOW_DEFINITIONS: readonly GuidedFlowDefinition[] =
  [
    ONBOARDING_FLOW_V1,
    ONBOARDING_FLOW_V2,
    ONBOARDING_FLOW,
    INITIALIZE_KODY_ENGINE_FLOW,
    SETUP_UI_LOGIN_FLOW,
    CREATE_WORKFLOW_FLOW,
  ];
