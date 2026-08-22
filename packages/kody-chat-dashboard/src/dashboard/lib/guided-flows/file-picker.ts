export interface GuidedFlowFilePickerContext {
  readonly instanceId: string;
  readonly stepId: string;
  readonly revision: number;
  readonly resultField: string;
  readonly extensions?: readonly string[];
}

export interface GuidedFlowFileSelection extends GuidedFlowFilePickerContext {
  readonly filePath: string;
  readonly fileName: string;
}

const PICKER_PARAM = "guidedFlowPicker";
const STORAGE_PREFIX = "kody:guided-flow:file-picker:";

function normalizedExtensions(extensions?: readonly string[]): string[] {
  return (extensions ?? [])
    .map((extension) => extension.trim().toLowerCase())
    .filter(Boolean)
    .map((extension) =>
      extension.startsWith(".") ? extension : `.${extension}`,
    );
}

export function buildGuidedFlowFilePickerHref(
  href: string,
  picker: GuidedFlowFilePickerContext,
): string {
  const url = new URL(href, "https://kody.local");
  url.searchParams.set(PICKER_PARAM, "1");
  url.searchParams.set("instanceId", picker.instanceId);
  url.searchParams.set("stepId", picker.stepId);
  url.searchParams.set("revision", String(picker.revision));
  url.searchParams.set("resultField", picker.resultField);
  const extensions = normalizedExtensions(picker.extensions);
  if (extensions.length > 0) {
    url.searchParams.set("extensions", extensions.join(","));
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function parseGuidedFlowFilePicker(
  searchParams: Pick<URLSearchParams, "get">,
): GuidedFlowFilePickerContext | null {
  if (searchParams.get(PICKER_PARAM) !== "1") return null;
  const instanceId = searchParams.get("instanceId")?.trim();
  const stepId = searchParams.get("stepId")?.trim();
  const resultField = searchParams.get("resultField")?.trim();
  const revision = Number(searchParams.get("revision"));
  if (
    !instanceId ||
    !stepId ||
    !resultField ||
    !Number.isInteger(revision) ||
    revision < 0
  ) {
    return null;
  }
  const extensions = normalizedExtensions(
    searchParams.get("extensions")?.split(","),
  );
  return {
    instanceId,
    stepId,
    revision,
    resultField,
    ...(extensions.length > 0 ? { extensions } : {}),
  };
}

export function fileMatchesPicker(
  filePath: string,
  picker: Pick<GuidedFlowFilePickerContext, "extensions">,
): boolean {
  const extensions = normalizedExtensions(picker.extensions);
  return (
    extensions.length === 0 ||
    extensions.some((extension) => filePath.toLowerCase().endsWith(extension))
  );
}

export function guidedFlowFileSelectionKey(
  picker: GuidedFlowFilePickerContext,
): string {
  return `${STORAGE_PREFIX}${picker.instanceId}:${picker.stepId}:${picker.revision}`;
}

export function storeGuidedFlowFileSelection(
  storage: Pick<Storage, "setItem">,
  selection: GuidedFlowFileSelection,
): void {
  storage.setItem(
    guidedFlowFileSelectionKey(selection),
    JSON.stringify(selection),
  );
}

export function consumeGuidedFlowFileSelection(
  storage: Pick<Storage, "getItem" | "removeItem">,
  picker: GuidedFlowFilePickerContext,
): GuidedFlowFileSelection | null {
  const key = guidedFlowFileSelectionKey(picker);
  const raw = storage.getItem(key);
  if (!raw) return null;
  storage.removeItem(key);
  try {
    const value = JSON.parse(raw) as Partial<GuidedFlowFileSelection>;
    return value.instanceId === picker.instanceId &&
      value.stepId === picker.stepId &&
      value.revision === picker.revision &&
      value.resultField === picker.resultField &&
      typeof value.filePath === "string" &&
      typeof value.fileName === "string"
      ? (value as GuidedFlowFileSelection)
      : null;
  } catch {
    return null;
  }
}
