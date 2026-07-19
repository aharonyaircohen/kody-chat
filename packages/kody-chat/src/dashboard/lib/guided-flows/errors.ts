const GUIDED_FLOW_ERROR_MESSAGES: Record<string, string> = {
  invalid_guided_flow_input:
    "Please complete the current step before continuing.",
  guided_flow_not_found:
    "This Guided Flow is no longer available. Please start it again.",
  revision_conflict:
    "This Guided Flow changed in another chat. Please resume it again.",
  step_conflict:
    "This Guided Flow step is out of date. Please resume it again.",
  guided_flow_workflow_exists:
    "A workflow with this name already exists. Choose a different name and try again.",
  guided_flow_invalid_workflow:
    "This workflow cannot be created with the selected capability. Check the capability and try again.",
};

export function guidedFlowActionErrorMessage(errorCode?: string): string {
  return (
    (errorCode ? GUIDED_FLOW_ERROR_MESSAGES[errorCode] : undefined) ??
    "We couldn't continue this Guided Flow. Your progress is saved; please try again."
  );
}
