import type { GuidedFlowDefinition } from "../controller";
import {
  buildGuidedFlowFromRequestBlueprint,
  type RequestBlueprintDefinition,
} from "../../request-blueprints";
import { CREATE_WORKFLOW_REQUEST_BLUEPRINT } from "./create-workflow";
import { INITIALIZE_KODY_ENGINE_REQUEST_BLUEPRINT } from "./initialize-kody-engine";
import { SETUP_UI_LOGIN_REQUEST_BLUEPRINT } from "./setup-ui-login";
import {
  PROJECT_ASSESSMENT_REQUEST_BLUEPRINT,
  PROJECT_ASSESSMENT_REQUEST_BLUEPRINT_V1,
} from "./project-assessment";
import {
  ONBOARDING_REQUEST_BLUEPRINT,
  ONBOARDING_REQUEST_BLUEPRINT_V1,
  ONBOARDING_REQUEST_BLUEPRINT_V2,
} from "./onboarding";
import { NEW_AGENCY_REQUEST_BLUEPRINT } from "./new-agency-request";
import { CREATE_BLUEPRINT_REQUEST_BLUEPRINT } from "../../request-blueprints/create-blueprint";

export { CREATE_WORKFLOW_FLOW_ID } from "./create-workflow";
export { INITIALIZE_KODY_ENGINE_FLOW_ID } from "./initialize-kody-engine";
export { ONBOARDING_FLOW_ID } from "./onboarding";
export { SETUP_UI_LOGIN_FLOW_ID } from "./setup-ui-login";
export { PROJECT_ASSESSMENT_FLOW_ID } from "./project-assessment";
export { NEW_AGENCY_REQUEST_FLOW_ID } from "./new-agency-request";
export { CREATE_BLUEPRINT_FLOW_ID } from "../../request-blueprints/create-blueprint";

export const BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS: readonly RequestBlueprintDefinition[] =
  [
    ONBOARDING_REQUEST_BLUEPRINT_V1,
    ONBOARDING_REQUEST_BLUEPRINT_V2,
    ONBOARDING_REQUEST_BLUEPRINT,
    INITIALIZE_KODY_ENGINE_REQUEST_BLUEPRINT,
    SETUP_UI_LOGIN_REQUEST_BLUEPRINT,
    CREATE_WORKFLOW_REQUEST_BLUEPRINT,
    PROJECT_ASSESSMENT_REQUEST_BLUEPRINT_V1,
    PROJECT_ASSESSMENT_REQUEST_BLUEPRINT,
    NEW_AGENCY_REQUEST_BLUEPRINT,
    CREATE_BLUEPRINT_REQUEST_BLUEPRINT,
  ];

export const BUILTIN_GUIDED_FLOW_DEFINITIONS: readonly GuidedFlowDefinition[] =
  BUILTIN_REQUEST_BLUEPRINT_DEFINITIONS.map(
    buildGuidedFlowFromRequestBlueprint,
  );
