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
  guided_flow_auth_failed:
    "Your repository connection needs attention before this workflow can be created.",
  guided_flow_rate_limited:
    "The repository service is temporarily busy. Please try again shortly.",
  guided_flow_completion_failed:
    "The workflow could not be created yet. Your Guided Flow is still open; please try again.",
};

export function guidedFlowActionErrorMessage(errorCode?: string): string {
  return (
    (errorCode ? GUIDED_FLOW_ERROR_MESSAGES[errorCode] : undefined) ??
    "We couldn't continue this Guided Flow. Your progress is saved; please try again."
  );
}
