export function locationAfterGuidedFlowLaunch(
  pathname: string,
  search: string,
): string {
  const params = new URLSearchParams(search);

  if (!params.has("guidedFlowInstanceId")) {
    return `${pathname}${search}`;
  }

  params.delete("guidedFlowInstanceId");
  params.delete("guidedFlow");
  params.delete("instanceKey");

  const remainingSearch = params.toString();
  return remainingSearch ? `${pathname}?${remainingSearch}` : pathname;
}
