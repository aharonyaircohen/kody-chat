/**
 * @fileType component
 * @domain brain
 * @pattern brain-images-manager
 *
 * Dedicated management surface for saved Brain container images.
 */
"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Brain,
  CheckCircle2,
  ExternalLink,
  Loader2,
  Play,
  RefreshCw,
  Trash2,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@dashboard/ui/button";
import { Card, CardContent } from "@dashboard/ui/card";
import { buildAuthHeaders, useAuth } from "../auth-context";
import { ConfirmDialog } from "./ConfirmDialog";
import { PageShell } from "./PageShell";

interface BrainSavedImage {
  imageRef: string;
  createdAt: string;
  updatedAt: string;
}

interface BrainImageSaveState {
  status: "running" | "completed" | "failed";
  jobId: string;
  imageRef: string;
  startedAt: string;
  updatedAt: string;
  error?: string;
}

interface BrainImagesResponse {
  ok?: boolean;
  imageRef?: string | null;
  runningImageRef?: string | null;
  runningAt?: string | null;
  runningApp?: string | null;
  runningMachineId?: string | null;
  images?: BrainSavedImage[];
  save?: BrainImageSaveState | null;
  message?: string;
  error?: string;
}

function imageTag(imageRef: string): string {
  const withoutDigest = imageRef.split("@")[0] ?? imageRef;
  const marker = withoutDigest.lastIndexOf(":");
  return marker === -1 ? imageRef : withoutDigest.slice(marker + 1);
}

function packageName(imageRef: string): string {
  const withoutTag = imageRef.split("@")[0]?.split(":")[0] ?? imageRef;
  return withoutTag.split("/").slice(-1)[0] ?? imageRef;
}

function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export function BrainImagesManager() {
  const { auth } = useAuth();
  const headers = useMemo(() => (auth ? buildAuthHeaders(auth) : null), [auth]);
  const [images, setImages] = useState<BrainSavedImage[]>([]);
  const [activeImageRef, setActiveImageRef] = useState<string | null>(null);
  const [runningImageRef, setRunningImageRef] = useState<string | null>(null);
  const [runningAt, setRunningAt] = useState<string | null>(null);
  const [save, setSave] = useState<BrainImageSaveState | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyRef, setBusyRef] = useState<string | null>(null);
  const [pendingForgetRef, setPendingForgetRef] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const loadImages = useCallback(async () => {
    if (!headers) {
      setImages([]);
      setActiveImageRef(null);
      setRunningImageRef(null);
      setRunningAt(null);
      setSave(null);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await fetch("/api/kody/brain/image", {
        headers,
        cache: "no-store",
      });
      const body = (await res.json().catch(() => ({}))) as BrainImagesResponse;
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? `Load failed (${res.status})`,
        );
      }
      setImages(body.images ?? []);
      setActiveImageRef(body.imageRef ?? null);
      setRunningImageRef(body.runningImageRef ?? null);
      setRunningAt(body.runningAt ?? null);
      setSave(body.save ?? null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load images");
      setImages([]);
      setActiveImageRef(null);
      setRunningImageRef(null);
      setRunningAt(null);
      setSave(null);
    } finally {
      setLoading(false);
    }
  }, [headers]);

  const pendingForgetImage = useMemo(
    () => images.find((image) => image.imageRef === pendingForgetRef) ?? null,
    [images, pendingForgetRef],
  );

  useEffect(() => {
    void loadImages();
  }, [loadImages]);

  async function selectImage(imageRef: string) {
    if (!headers) return;
    setBusyRef(imageRef);
    try {
      const res = await fetch("/api/kody/brain/image", {
        method: "PATCH",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ imageRef }),
      });
      const body = (await res.json().catch(() => ({}))) as BrainImagesResponse;
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? `Select failed (${res.status})`,
        );
      }
      await loadImages();
      toast.success("Brain image selected");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Select failed");
    } finally {
      setBusyRef(null);
    }
  }

  async function applyImage(imageRef: string) {
    if (!headers) return;
    setBusyRef(imageRef);
    try {
      const res = await fetch("/api/kody/brain/image/apply", {
        method: "POST",
        headers: { "content-type": "application/json", ...headers },
        body: JSON.stringify({ imageRef }),
      });
      const body = (await res.json().catch(() => ({}))) as BrainImagesResponse;
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? `Apply failed (${res.status})`,
        );
      }
      await loadImages();
      window.dispatchEvent(new Event("kody:fly-machines-refresh"));
      toast.success("Brain image applied");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Apply failed");
    } finally {
      setBusyRef(null);
    }
  }

  async function forgetImage(imageRef: string) {
    if (!headers) return;
    setBusyRef(imageRef);
    try {
      const res = await fetch(
        `/api/kody/brain/image?imageRef=${encodeURIComponent(imageRef)}`,
        { method: "DELETE", headers },
      );
      const body = (await res.json().catch(() => ({}))) as BrainImagesResponse;
      if (!res.ok) {
        throw new Error(
          body.message ?? body.error ?? `Forget failed (${res.status})`,
        );
      }
      await loadImages();
      toast.success("Brain image forgotten");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Forget failed");
    } finally {
      setBusyRef(null);
    }
  }

  return (
    <PageShell
      title="Brain Images"
      icon={Brain}
      iconClassName="text-violet-400"
      subtitle="Saved Brain runtime images and active restore selection."
    >
      <div className="space-y-4">
        <Card className="border-white/[0.08] bg-white/[0.03]">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="min-w-0">
              <div className="text-sm font-semibold text-white">
                Saved images
              </div>
              <div className="mt-1 truncate text-xs text-white/50">
                {activeImageRef
                  ? `Selected: ${packageName(activeImageRef)}:${imageTag(activeImageRef)}`
                  : "No Brain image selected"}
              </div>
              <div className="mt-1 truncate text-xs text-white/50">
                {runningImageRef
                  ? `Running: ${packageName(runningImageRef)}:${imageTag(runningImageRef)}${
                      runningAt ? ` since ${formatDate(runningAt)}` : ""
                    }`
                  : "No saved Brain image is marked as running"}
              </div>
              {save?.status === "running" && (
                <div className="mt-1 text-xs text-amber-300">
                  Save running: {imageTag(save.imageRef)}
                </div>
              )}
              {save?.status === "failed" && (
                <div className="mt-1 text-xs text-rose-300">
                  Last save failed: {save.error ?? save.jobId}
                </div>
              )}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => void loadImages()}
              disabled={loading}
              className="gap-2"
            >
              {loading ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="h-4 w-4" />
              )}
              Refresh
            </Button>
          </CardContent>
        </Card>

        {error && (
          <div className="rounded-md border border-rose-500/30 bg-rose-500/10 px-3 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}

        <div className="space-y-2">
          {loading && images.length === 0 ? (
            <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-sm text-white/50">
              Loading Brain images...
            </div>
          ) : images.length === 0 ? (
            <div className="rounded-md border border-white/[0.08] bg-white/[0.03] px-4 py-8 text-center text-sm text-white/50">
              No Brain images saved yet.
            </div>
          ) : (
            images.map((image) => {
              const selected = image.imageRef === activeImageRef;
              const running = image.imageRef === runningImageRef;
              const busy = busyRef === image.imageRef;
              return (
                <div
                  key={image.imageRef}
                  className="grid gap-3 rounded-md border border-white/[0.08] bg-white/[0.03] p-4 sm:grid-cols-[minmax(0,1fr)_auto]"
                >
                  <div className="min-w-0 space-y-1">
                    <div className="flex min-w-0 items-center gap-2">
                      {running && (
                        <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-300" />
                      )}
                      <span className="truncate font-mono text-sm text-white">
                        {packageName(image.imageRef)}:{imageTag(image.imageRef)}
                      </span>
                    </div>
                    <div className="truncate font-mono text-xs text-white/35">
                      {image.imageRef}
                    </div>
                    <div className="text-xs text-white/45">
                      Created {formatDate(image.createdAt)}
                    </div>
                  </div>
                  <div className="flex items-center gap-1 sm:justify-end">
                    <Button
                      type="button"
                      size="sm"
                      variant={selected ? "secondary" : "outline"}
                      disabled={selected || busy}
                      onClick={() => void selectImage(image.imageRef)}
                    >
                      {selected ? "Selected" : "Select"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant={running ? "secondary" : "default"}
                      disabled={running || busy}
                      className="gap-2"
                      onClick={() => void applyImage(image.imageRef)}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Play className="h-4 w-4" />
                      )}
                      {running ? "Running" : "Apply"}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Open package"
                      aria-label="Open package"
                      onClick={() =>
                        window.open(
                          `https://${image.imageRef.split(":")[0]}`,
                          "_blank",
                        )
                      }
                    >
                      <ExternalLink className="h-4 w-4" />
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      variant="ghost"
                      title="Forget image"
                      aria-label="Forget image"
                      disabled={busy}
                      onClick={() => setPendingForgetRef(image.imageRef)}
                    >
                      {busy ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Trash2 className="h-4 w-4" />
                      )}
                    </Button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
      <ConfirmDialog
        open={pendingForgetRef !== null}
        title="Forget Brain image?"
        description={
          pendingForgetImage
            ? `Remove ${packageName(pendingForgetImage.imageRef)}:${imageTag(
                pendingForgetImage.imageRef,
              )} from this list. This does not delete the GHCR package image.`
            : "Remove this Brain image from this list. This does not delete the GHCR package image."
        }
        confirmLabel="Forget"
        variant="destructive"
        onConfirm={() => {
          if (pendingForgetRef) void forgetImage(pendingForgetRef);
        }}
        onClose={() => setPendingForgetRef(null)}
      />
    </PageShell>
  );
}
