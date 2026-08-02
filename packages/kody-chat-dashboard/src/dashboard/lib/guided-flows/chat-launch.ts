export function locationAfterGuidedFlowLaunch(
  pathname: string,
  search: string,
): string {
  const params = new URLSearchParams(search);

  if (
    !params.has("guidedFlowInstanceId") &&
    params.get("guidedFlowOnce") !== "1"
  ) {
    return `${pathname}${search}`;
  }

  params.delete("guidedFlowInstanceId");
  params.delete("guidedFlow");
  params.delete("instanceKey");
  params.delete("guidedFlowOnce");

  const remainingSearch = params.toString();
  return remainingSearch ? `${pathname}?${remainingSearch}` : pathname;
}
