import { repoScopedHref, type RepoRef } from "@kody-ade/base/routes";

export function guidedFlowChatHref(ref: RepoRef, flowId: string): string {
  return repoScopedHref(
    ref,
    `/chat?guidedFlow=${encodeURIComponent(flowId)}`,
  );
}

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
