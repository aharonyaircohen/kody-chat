/**
 * @fileType component
 * @domain variables
 * @pattern models-manager
 * @ai-summary CRUD UI for the chat model list (LLM_MODELS variable).
 *   Scannable list view; the editor opens in a dialog with just the
 *   essentials surfaced — provider preset auto-fills baseURL/protocol,
 *   "Advanced" reveals internal id + URL + protocol for the `custom`
 *   provider case. The list drives the chat dropdown across the
 *   dashboard and /vibe; OpenRouter Free remains available when empty.
 */
"use client";

import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Bot,
  ArrowDown,
  ArrowUp,
  ChevronDown,
  ChevronRight,
  Loader2,
  MoreHorizontal,
  Pencil,
  Power,
  Plus,
  Save,
  Star,
  Trash2,
} from "lucide-react";
import { PageShell } from "./PageShell";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Input } from "@kody-ade/base/ui/input";
import { Label } from "@kody-ade/base/ui/label";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@kody-ade/base/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@kody-ade/base/ui/dialog";
import { ConfirmDialog } from "./ConfirmDialog";
import {
  PROVIDER_PRESETS,
  PROVIDER_PRESET_IDS,
  type ChatAdapter,
  type ChatModel,
  type AutomaticModel,
  type ChatProtocol,
  type ProviderPreset,
} from "@kody-ade/base/variables/models";
import { buildAuthHeaders, useAuth } from "../auth-context";
import {
  KODY_BUILT_IN_CHAT_MODELS,
  composeChatModelCatalog,
} from "../chat/model-catalog";

export const modelsQueryKeys = {
  all: ["kody-chat-models"] as const,
  list: (_legacyRepoScope?: unknown) =>
    ["kody-chat-models", "personal"] as const,
};

const SECRET_NAME_RE = /^[A-Z][A-Z0-9_]{0,127}$/;

async function fetchModels(
  headers: Record<string, string>,
): Promise<{ models: ChatModel[]; automatic: AutomaticModel }> {
  const res = await fetch("/api/kody/models", {
    headers,
    cache: "no-store",
  });
  const json = (await res.json().catch(() => ({}))) as {
    models?: ChatModel[];
    automatic?: AutomaticModel;
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
  return {
    models: json.models ?? [],
    automatic: json.automatic ?? { default: false, engineDefault: false },
  };
}

async function saveModels(
  headers: Record<string, string>,
  models: ChatModel[],
  automatic: AutomaticModel,
): Promise<void> {
  const res = await fetch("/api/kody/models", {
    method: "PUT",
    headers,
    body: JSON.stringify({ models, automatic }),
  });
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  if (!res.ok) {
    throw new Error(json.message || json.error || `HTTP ${res.status}`);
  }
}

type CredentialMetadata = { name: string; updatedAt: string };

async function fetchCredentials(): Promise<CredentialMetadata[]> {
  const res = await fetch("/api/kody/account/credentials", { cache: "no-store" });
  const json = (await res.json().catch(() => ({}))) as {
    credentials?: CredentialMetadata[];
    error?: string;
  };
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
  return json.credentials ?? [];
}

async function saveCredential(name: string, value: string): Promise<void> {
  const res = await fetch("/api/kody/account/credentials", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, value }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
}

async function importRepositoryCredential(
  name: string,
  headers: Record<string, string>,
): Promise<void> {
  const res = await fetch("/api/kody/account/credentials/import", {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify({ name }),
  });
  const json = (await res.json().catch(() => ({}))) as { error?: string };
  if (!res.ok) throw new Error(json.error || `HTTP ${res.status}`);
}

function blankModel(): ChatModel {
  const p = PROVIDER_PRESETS.anthropic;
  return {
    id: "",
    label: "",
    provider: "anthropic",
    adapter: p.adapter,
    adapterBaseURL: p.adapterBaseURL,
    protocol: p.protocol,
    baseURL: p.baseURL,
    modelName: "",
    apiKeySecret: p.keyHint,
    enabled: true,
    automatic: false,
    default: false,
    engineDefault: false,
  };
}

/** Derive an internal id when the user didn't override it. */
function deriveId(m: ChatModel): string {
  if (m.id.trim()) return m.id.trim();
  if (!m.modelName.trim()) return "";
  return `${m.provider}/${m.modelName.trim()}`;
}

export function ModelsManager() {
  const { auth } = useAuth();
  const headers = { "Content-Type": "application/json" };
  const listQueryKey = modelsQueryKeys.list();

  const queryClient = useQueryClient();
  const { data, isLoading, error, refetch } = useQuery<{
    models: ChatModel[];
    automatic: AutomaticModel;
  }>({
    queryKey: listQueryKey,
    queryFn: () => fetchModels(headers),
    staleTime: 30_000,
  });
  const { data: credentials = [] } = useQuery({
    queryKey: ["kody-user-credentials"],
    queryFn: fetchCredentials,
    staleTime: 30_000,
  });
  const models = composeChatModelCatalog<ChatModel>(
    data?.models ?? [],
    KODY_BUILT_IN_CHAT_MODELS,
  );
  const automatic = data?.automatic ?? { default: false, engineDefault: false };
  const selectedAutomaticModels = models.filter(
    (model) => model.automatic === true,
  );
  const automaticModels = models.filter(
    (model) => model.enabled !== false && model.automatic === true,
  );

  const save = useMutation({
    mutationFn: ({
      list,
      automatic: nextAutomatic,
    }: {
      list: ChatModel[];
      automatic: AutomaticModel;
    }) => saveModels(headers, list, nextAutomatic),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: modelsQueryKeys.all });
      queryClient.invalidateQueries({ queryKey: listQueryKey });
    },
    onError: (err: Error) =>
      toast.error(err.message || "Failed to save models"),
  });

  const [editing, setEditing] = useState<
    { mode: "create" } | { mode: "edit"; idx: number } | null
  >(null);
  const [deleting, setDeleting] = useState<number | null>(null);

  const upsert = async (next: ChatModel, credentialValue?: string) => {
    let list = [...models];
    if (editing?.mode === "edit") {
      list[editing.idx] = next;
    } else {
      list.push(next);
    }
    // Enforce "at most one default" client-side by clearing the flag on
    // every other entry when this one sets it.
    const savedIdx = editing?.mode === "edit" ? editing.idx : list.length - 1;
    if (next.default) {
      list = list.map((m, i) =>
        i === savedIdx ? m : { ...m, default: false },
      );
    }
    const nextAutomatic = {
      ...automatic,
      ...(next.default ? { default: false } : {}),
      engineDefault: false,
    };
    if (credentialValue) {
      await saveCredential(next.apiKeySecret, credentialValue);
      await queryClient.invalidateQueries({ queryKey: ["kody-user-credentials"] });
    }
    await save.mutateAsync({ list, automatic: nextAutomatic });
    toast.success("Model saved");
    setEditing(null);
  };

  const toggleEnabled = (idx: number) => {
    const list = models.map((m, i) =>
      i === idx ? { ...m, enabled: m.enabled === false } : m,
    );
    const automaticCount = list.filter(
      (model) => model.enabled !== false && model.automatic === true,
    ).length;
    save.mutate({
      list,
      automatic:
        automaticCount < 2
          ? { ...automatic, default: false, engineDefault: false }
          : automatic,
    });
  };

  const toggleAutomatic = (idx: number) => {
    const list = models.map((model, modelIdx) =>
      modelIdx === idx
        ? { ...model, automatic: model.automatic !== true }
        : model,
    );
    const automaticCount = list.filter(
      (model) => model.enabled !== false && model.automatic === true,
    ).length;
    save.mutate({
      list,
      automatic:
        automaticCount < 2
          ? { ...automatic, default: false, engineDefault: false }
          : automatic,
    });
  };

  const moveAutomatic = (idx: number, offset: -1 | 1) => {
    const selectedIndices = models.flatMap((model, modelIdx) =>
      model.automatic === true ? [modelIdx] : [],
    );
    const selectedPosition = selectedIndices.indexOf(idx);
    const target = selectedIndices[selectedPosition + offset];
    if (target === undefined) return;
    const list = [...models];
    [list[idx], list[target]] = [list[target]!, list[idx]!];
    save.mutate({ list, automatic });
  };

  const setAutomaticChatDefault = (checked: boolean) => {
    const list = checked
      ? models.map((model) => ({ ...model, default: false }))
      : models;
    save.mutate({
      list,
      automatic: { ...automatic, default: checked },
    });
  };

  const remove = (idx: number) => {
    const list = models.filter((_, i) => i !== idx);
    save.mutateAsync({ list, automatic }).then(() => {
      toast.success("Model deleted");
      setDeleting(null);
    });
  };

  return (
    <PageShell
      title="Chat Models"
      icon={Bot}
      iconClassName="text-violet-400"
      actions={
        <Button
          size="sm"
          onClick={() => setEditing({ mode: "create" })}
          className="gap-1"
        >
          <Plus className="w-4 h-4" />
          New model
        </Button>
      }
    >
      <div className="space-y-3">
        <p className="text-sm text-white/55">
          Your chat models and API keys belong to your Kody account.
        </p>

        {isLoading && (
          <p className="text-sm text-white/50 flex items-center gap-2">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading models…
          </p>
        )}

        {error && (
          <Card className="border-rose-500/30 bg-rose-950/20">
            <CardContent className="p-4 text-sm">
              <p className="text-rose-300 font-medium">
                Couldn&apos;t load models
              </p>
              <p className="text-rose-200/70 mt-1">
                {error instanceof Error ? error.message : "Unknown error"}
              </p>
              <Button
                size="sm"
                variant="outline"
                className="mt-3"
                onClick={() => refetch()}
              >
                Retry
              </Button>
            </CardContent>
          </Card>
        )}

        {!isLoading && !error && (
          <Card className="border-sky-500/20 bg-sky-500/[0.05]">
            <CardContent className="p-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="font-medium text-sm text-white/90">
                    Automatic
                  </span>
                  {automatic.default && (
                    <span
                      className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-amber-300"
                      title="Used for new conversations"
                    >
                      <Star className="h-3 w-3" /> Chat
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/45 mt-0.5">
                  {automaticModels.length >= 2
                    ? `Uses ${automaticModels.length} selected models in order when one is rate limited.`
                    : "Select at least two models below."}
                </p>
              </div>
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <Checkbox
                    checked={automatic.default === true}
                    disabled={automaticModels.length < 2}
                    onCheckedChange={(checked) =>
                      setAutomaticChatDefault(checked === true)
                    }
                    aria-label="Use Automatic as the Chat default"
                  />
                  Chat default
                </label>
              </div>
            </CardContent>
          </Card>
        )}

        <ul className="space-y-2">
          {models.map((m, idx) => (
            <li key={idx}>
              <Card className="border-white/[0.08] bg-white/[0.03]">
                <CardContent className="flex flex-col gap-2 p-3 sm:flex-row sm:items-center sm:justify-between sm:gap-3">
                  <div className="min-w-0 flex-1">
                    <div
                      className={`min-w-0 ${m.enabled === false ? "opacity-55" : ""}`}
                    >
                      <div className="flex items-center gap-2">
                        <span className="font-medium text-sm text-white/90 truncate">
                          {m.label || m.modelName || m.id}
                        </span>
                        {KODY_BUILT_IN_CHAT_MODELS.some(
                          (builtIn) => builtIn.id === m.id,
                        ) && (
                          <span className="text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-white/[0.06] text-white/50">
                            Built in
                          </span>
                        )}
                        {m.enabled === false && (
                          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-white/50">
                            Disabled
                          </span>
                        )}
                        {m.default && (
                          <span
                            className="inline-flex items-center gap-1 text-[10px] uppercase tracking-wide px-1.5 py-0.5 rounded bg-amber-500/15 text-amber-300"
                            title="Used for new conversations"
                          >
                            <Star className="w-3 h-3" />
                            Chat
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/45 mt-0.5 font-mono truncate">
                        {PROVIDER_PRESETS[m.provider]?.label ?? m.provider} ·{" "}
                        {m.modelName}
                      </p>
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center justify-end gap-1">
                    <label className="flex cursor-pointer items-center gap-1.5 rounded-md px-2 py-1 text-xs text-white/60 hover:bg-white/[0.04] hover:text-white/80">
                      <Checkbox
                        checked={m.automatic === true}
                        disabled={m.enabled === false || save.isPending}
                        onCheckedChange={() => toggleAutomatic(idx)}
                        aria-label={`Include ${m.label || m.modelName} in Automatic`}
                      />
                      Auto
                    </label>
                    {m.automatic === true && (
                      <>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={
                            selectedAutomaticModels[0]?.id === m.id ||
                            save.isPending
                          }
                          onClick={() => moveAutomatic(idx, -1)}
                          aria-label={`Move ${m.label || m.modelName} up in Automatic`}
                        >
                          <ArrowUp className="w-3.5 h-3.5" />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          disabled={
                            selectedAutomaticModels.at(-1)?.id === m.id ||
                            save.isPending
                          }
                          onClick={() => moveAutomatic(idx, 1)}
                          aria-label={`Move ${m.label || m.modelName} down in Automatic`}
                        >
                          <ArrowDown className="w-3.5 h-3.5" />
                        </Button>
                      </>
                    )}
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label={`More actions for ${m.label || m.modelName}`}
                        >
                          <MoreHorizontal className="h-4 w-4" />
                        </Button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-36">
                        <DropdownMenuItem onClick={() => toggleEnabled(idx)}>
                          <Power className="h-3.5 w-3.5" />
                          {m.enabled === false
                            ? "Enable model"
                            : "Disable model"}
                        </DropdownMenuItem>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={() => setEditing({ mode: "edit", idx })}
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </DropdownMenuItem>
                        {!KODY_BUILT_IN_CHAT_MODELS.some(
                          (builtIn) => builtIn.id === m.id,
                        ) && (
                          <>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-rose-300 focus:text-rose-200"
                              onClick={() => setDeleting(idx)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                              Delete
                            </DropdownMenuItem>
                          </>
                        )}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </div>
                </CardContent>
              </Card>
            </li>
          ))}
        </ul>
      </div>

      {editing && (
        <ModelEditor
          initial={editing.mode === "edit" ? models[editing.idx] : blankModel()}
          existing={models}
          editingIdx={editing.mode === "edit" ? editing.idx : null}
          saving={save.isPending}
          configuredCredentialNames={credentials.map(
            (credential) => credential.name,
          )}
          onImportCredential={
            auth
              ? async (name) => {
                  await importRepositoryCredential(name, buildAuthHeaders(auth));
                  await queryClient.invalidateQueries({
                    queryKey: ["kody-user-credentials"],
                  });
                  toast.success("API key copied to your Kody account");
                }
              : undefined
          }
          onClose={() => setEditing(null)}
          onSave={upsert}
        />
      )}

      <ConfirmDialog
        open={deleting !== null}
        title="Delete this model?"
        description="The model is removed from your account. Its saved API key is kept in case another model uses it."
        confirmLabel={save.isPending ? "Deleting…" : "Delete"}
        variant="destructive"
        onConfirm={() => {
          if (deleting !== null) remove(deleting);
        }}
        onClose={() => setDeleting(null)}
      />
    </PageShell>
  );
}

interface ModelEditorProps {
  initial: ChatModel;
  existing: ChatModel[];
  editingIdx: number | null;
  saving: boolean;
  configuredCredentialNames: string[];
  onImportCredential?: (name: string) => Promise<void>;
  onClose: () => void;
  onSave: (m: ChatModel, credentialValue?: string) => Promise<void>;
}

function ModelEditor({
  initial,
  existing,
  editingIdx,
  saving,
  configuredCredentialNames,
  onImportCredential,
  onClose,
  onSave,
}: ModelEditorProps) {
  const [draft, setDraft] = useState<ChatModel>(initial);
  const [credentialValue, setCredentialValue] = useState("");
  const [importedCredentialName, setImportedCredentialName] = useState<
    string | null
  >(null);
  const [importingCredential, setImportingCredential] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState<boolean>(
    initial.provider === "custom",
  );
  const credentialConfigured =
    configuredCredentialNames.includes(draft.apiKeySecret) ||
    importedCredentialName === draft.apiKeySecret;

  // When the user picks a different preset, refresh the auto-managed
  // fields. The user's modelName + label survive — only adapter/protocol,
  // endpoints, and key hint update.
  const applyPreset = (preset: ProviderPreset) => {
    const p = PROVIDER_PRESETS[preset];
    setDraft((cur) => ({
      ...cur,
      provider: preset,
      adapter: p.adapter,
      adapterBaseURL: p.adapterBaseURL,
      protocol: p.protocol,
      baseURL: p.baseURL,
      // Only overwrite the key hint when the user hasn't typed a custom
      // value yet (i.e. it matches the previous preset's hint). Avoids
      // clobbering a deliberate override.
      apiKeySecret:
        cur.apiKeySecret === PROVIDER_PRESETS[cur.provider].keyHint
          ? p.keyHint
          : cur.apiKeySecret,
    }));
    if (preset === "custom") setAdvancedOpen(true);
  };

  // Derived id — what we'll actually save when the user hasn't set one.
  const derivedId = deriveId(draft);
  const idClash =
    derivedId !== "" &&
    existing.some((m, i) => i !== editingIdx && deriveId(m) === derivedId);

  const errors = {
    label: draft.label.trim() ? null : "Required",
    modelName: draft.modelName.trim() ? null : "Required",
    apiKeySecret: !draft.apiKeySecret.trim()
      ? "Required"
      : !SECRET_NAME_RE.test(draft.apiKeySecret)
        ? "Uppercase letters, digits, _ — start with a letter"
        : null,
    baseURL:
      draft.protocol === "openai" && !draft.baseURL.trim()
        ? "Required for OpenAI-compatible models"
        : null,
    adapterBaseURL:
      draft.adapter === "openai-compatible" && !draft.adapterBaseURL?.trim()
        ? "Required for OpenAI-compatible chat"
        : null,
    id: idClash ? "Another model already uses this id" : null,
    credential:
      credentialConfigured || credentialValue.trim()
        ? null
        : "Enter an API key",
  };
  const canSave =
    !saving &&
    !errors.label &&
    !errors.modelName &&
    !errors.apiKeySecret &&
    !errors.baseURL &&
    !errors.adapterBaseURL &&
    !errors.id &&
    !errors.credential;

  const handleSave = () => {
    if (!canSave) return;
    const finalModel: ChatModel = {
      ...draft,
      id: derivedId,
    };
    onSave(finalModel, credentialValue.trim() || undefined);
  };

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent
        modalSize="wide"
        modalHeight="viewport"
        className="min-w-0"
      >
        <DialogHeader>
          <DialogTitle>
            {editingIdx !== null ? "Edit model" : "Add model"}
          </DialogTitle>
          <DialogDescription>
            Pick a provider and fill in the model + key. Defaults cover the
            common cases — open Advanced to override URL or protocol.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-2 flex min-h-0 min-w-0 flex-col gap-3 overflow-visible">
          <div>
            <Label className="text-xs">Provider</Label>
            <select
              value={draft.provider}
              onChange={(ev) => applyPreset(ev.target.value as ProviderPreset)}
              className="w-full h-9 rounded-md border border-white/[0.08] bg-background px-2 text-sm"
            >
              {PROVIDER_PRESET_IDS.map((p) => (
                <option key={p} value={p}>
                  {PROVIDER_PRESETS[p].label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <Label className="text-xs">Model name</Label>
            <Input
              value={draft.modelName}
              onChange={(ev) =>
                setDraft((cur) => ({
                  ...cur,
                  modelName: ev.target.value.trim(),
                }))
              }
              placeholder={
                draft.provider === "anthropic"
                  ? "claude-sonnet-4-6"
                  : draft.provider === "google"
                    ? "gemini-2.5-flash"
                    : draft.provider === "openai"
                      ? "gpt-4o"
                      : "model-id"
              }
              className="font-mono text-xs"
            />
            {errors.modelName && (
              <p className="text-[11px] text-rose-300 mt-1">
                {errors.modelName}
              </p>
            )}
          </div>

          <div>
            <Label className="text-xs">Display label</Label>
            <Input
              value={draft.label}
              onChange={(ev) =>
                setDraft((cur) => ({ ...cur, label: ev.target.value }))
              }
              placeholder="Claude Sonnet 4.6"
              className="text-xs"
              autoFocus={editingIdx === null}
            />
            {errors.label && (
              <p className="text-[11px] text-rose-300 mt-1">{errors.label}</p>
            )}
          </div>

          <div>
            <Label className="text-sm">API key</Label>
            <Input
              type="password"
              value={credentialValue}
              onChange={(ev) => setCredentialValue(ev.target.value)}
              placeholder={
                credentialConfigured
                  ? "Leave blank to keep the saved key"
                  : "Paste your provider API key"
              }
              autoComplete="off"
              className="font-mono text-xs"
            />
            {errors.credential && (
              <p className="text-[11px] text-rose-300 mt-1">
                {errors.credential}
              </p>
            )}
            {!credentialConfigured && onImportCredential && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="mt-2"
                disabled={importingCredential || Boolean(errors.apiKeySecret)}
                onClick={async () => {
                  setImportingCredential(true);
                  try {
                    await onImportCredential(draft.apiKeySecret);
                    setImportedCredentialName(draft.apiKeySecret);
                  } catch (error) {
                    toast.error(
                      error instanceof Error
                        ? error.message
                        : "Could not import the repository key",
                    );
                  } finally {
                    setImportingCredential(false);
                  }
                }}
              >
                {importingCredential
                  ? "Copying…"
                  : "Copy existing repository key"}
              </Button>
            )}
          </div>

          <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer pt-1">
            <Checkbox
              checked={draft.default === true}
              onCheckedChange={(checked) =>
                setDraft((cur) => ({ ...cur, default: checked === true }))
              }
            />
            <Star className="w-3.5 h-3.5 text-white/40" />
            Default for chat (used for new conversations)
          </label>

          <button
            type="button"
            onClick={() => setAdvancedOpen((v) => !v)}
            className="text-xs text-white/55 hover:text-white/80 flex items-center gap-1 pt-2"
          >
            {advancedOpen ? (
              <ChevronDown className="w-3.5 h-3.5" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5" />
            )}
            Advanced
          </button>

          {advancedOpen && (
            <div className="space-y-3 pt-1 border-t border-white/[0.06]">
              <div>
                <Label className="text-xs">Credential name</Label>
                <Input
                  value={draft.apiKeySecret}
                  onChange={(ev) =>
                    setDraft((cur) => ({
                      ...cur,
                      apiKeySecret: ev.target.value.toUpperCase(),
                    }))
                  }
                  placeholder="ANTHROPIC_API_KEY"
                  className="font-mono text-xs"
                />
                {errors.apiKeySecret && (
                  <p className="text-[11px] text-rose-300 mt-1">
                    {errors.apiKeySecret}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Chat adapter</Label>
                <select
                  value={
                    draft.adapter ?? PROVIDER_PRESETS[draft.provider].adapter
                  }
                  onChange={(ev) =>
                    setDraft((cur) => ({
                      ...cur,
                      adapter: ev.target.value as ChatAdapter,
                    }))
                  }
                  className="w-full h-9 rounded-md border border-white/[0.08] bg-background px-2 text-xs font-mono"
                >
                  <option value="anthropic">anthropic</option>
                  <option value="google">google</option>
                  <option value="openai-compatible">openai-compatible</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Chat API URL</Label>
                <Input
                  value={draft.adapterBaseURL ?? ""}
                  onChange={(ev) =>
                    setDraft((cur) => ({
                      ...cur,
                      adapterBaseURL: ev.target.value.trim(),
                    }))
                  }
                  placeholder="https://api.example.com/v1"
                  className="font-mono text-xs"
                />
                {errors.adapterBaseURL && (
                  <p className="text-[11px] text-rose-300 mt-1">
                    {errors.adapterBaseURL}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Engine API URL</Label>
                <Input
                  value={draft.baseURL}
                  onChange={(ev) =>
                    setDraft((cur) => ({
                      ...cur,
                      baseURL: ev.target.value.trim(),
                    }))
                  }
                  placeholder="https://api.example.com/v1"
                  className="font-mono text-xs"
                />
                {errors.baseURL && (
                  <p className="text-[11px] text-rose-300 mt-1">
                    {errors.baseURL}
                  </p>
                )}
              </div>
              <div>
                <Label className="text-xs">Engine protocol</Label>
                <select
                  value={draft.protocol}
                  onChange={(ev) =>
                    setDraft((cur) => ({
                      ...cur,
                      protocol: ev.target.value as ChatProtocol,
                    }))
                  }
                  className="w-full h-9 rounded-md border border-white/[0.08] bg-background px-2 text-xs font-mono"
                >
                  <option value="anthropic">anthropic</option>
                  <option value="openai">openai-compatible</option>
                </select>
              </div>
              <div>
                <Label className="text-xs">Internal id (auto)</Label>
                <Input
                  value={draft.id || derivedId}
                  onChange={(ev) =>
                    setDraft((cur) => ({ ...cur, id: ev.target.value.trim() }))
                  }
                  placeholder={derivedId || "<provider>/<modelName>"}
                  className="font-mono text-xs"
                />
                {errors.id && (
                  <p className="text-[11px] text-rose-300 mt-1">{errors.id}</p>
                )}
              </div>
              <div>
                <Label className="text-xs">Max research steps</Label>
                <Input
                  type="number"
                  min={1}
                  max={500}
                  value={draft.maxSteps ?? ""}
                  onChange={(ev) => {
                    const raw = ev.target.value.trim();
                    if (raw === "") {
                      setDraft((cur) => {
                        const { maxSteps: _, ...rest } = cur;
                        return rest as ChatModel;
                      });
                      return;
                    }
                    const n = Number.parseInt(raw, 10);
                    if (!Number.isFinite(n)) return;
                    setDraft((cur) => ({ ...cur, maxSteps: n }));
                  }}
                  placeholder="10 (default)"
                  className="font-mono text-xs"
                />
                <p className="text-[11px] text-white/40 mt-1">
                  Per-turn tool-call rounds. Blank → 10. Raise for models that
                  need long research chains.
                </p>
              </div>
            </div>
          )}
          <div className="mt-auto flex justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              size="sm"
              disabled={!canSave}
              onClick={handleSave}
              className="gap-1"
            >
              {saving ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  Saving…
                </>
              ) : (
                <>
                  <Save className="w-3.5 h-3.5" />
                  {editingIdx !== null ? "Save" : "Add"}
                </>
              )}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
