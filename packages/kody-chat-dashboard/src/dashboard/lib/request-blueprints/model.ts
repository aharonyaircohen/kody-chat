import type { GuidedFlowDefinition } from "../guided-flows/model";

/**
 * The complete source for both a user Guided Flow and Kody's matching guide.
 * GuidedFlowDefinition is deliberately the generated runtime shape rather than
 * a second independently authored model.
 */
export interface RequestBlueprintDefinition extends GuidedFlowDefinition {
  readonly purpose: string;
}
