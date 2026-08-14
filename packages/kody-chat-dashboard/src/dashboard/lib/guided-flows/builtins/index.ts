import type { GuidedFlowDefinition } from "../controller";
import { CREATE_WORKFLOW_FLOW } from "./create-workflow";
import { INITIALIZE_KODY_ENGINE_FLOW } from "./initialize-kody-engine";
import { SETUP_UI_LOGIN_FLOW } from "./setup-ui-login";
import {
  PROJECT_ASSESSMENT_FLOW,
  PROJECT_ASSESSMENT_FLOW_V1,
} from "./project-assessment";
import {
  ONBOARDING_FLOW,
  ONBOARDING_FLOW_V1,
  ONBOARDING_FLOW_V2,
} from "./onboarding";
import { NEW_AGENCY_REQUEST_FLOW } from "./new-agency-request";
import { CREATE_BLUEPRINT_FLOW } from "../../request-blueprints/create-blueprint";

export { CREATE_WORKFLOW_FLOW_ID } from "./create-workflow";
export { INITIALIZE_KODY_ENGINE_FLOW_ID } from "./initialize-kody-engine";
export { ONBOARDING_FLOW_ID } from "./onboarding";
export { SETUP_UI_LOGIN_FLOW_ID } from "./setup-ui-login";
export { PROJECT_ASSESSMENT_FLOW_ID } from "./project-assessment";
export { NEW_AGENCY_REQUEST_FLOW_ID } from "./new-agency-request";
export { CREATE_BLUEPRINT_FLOW_ID } from "../../request-blueprints/create-blueprint";

export const BUILTIN_GUIDED_FLOW_DEFINITIONS: readonly GuidedFlowDefinition[] =
  [
    ONBOARDING_FLOW_V1,
    ONBOARDING_FLOW_V2,
    ONBOARDING_FLOW,
    INITIALIZE_KODY_ENGINE_FLOW,
    SETUP_UI_LOGIN_FLOW,
    CREATE_WORKFLOW_FLOW,
    PROJECT_ASSESSMENT_FLOW_V1,
    PROJECT_ASSESSMENT_FLOW,
    NEW_AGENCY_REQUEST_FLOW,
    CREATE_BLUEPRINT_FLOW,
  ];
