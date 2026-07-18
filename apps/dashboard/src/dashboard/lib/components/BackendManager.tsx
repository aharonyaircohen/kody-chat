/**
 * @fileType component
 * @domain kody
 * @pattern backend-manager
 * @ai-summary Backend admin page — back up the tenant's data as a JSON dump
 *   straight from the Convex database (standing tool), export from the legacy
 *   GitHub state repo (one-time migration), and import a dump into Convex.
 *   Follows the standard admin-page skeleton (PageShell header + Cards,
 *   ui-kit controls only).
 */
"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  Database,
  Download,
  FileJson,
  Loader2,
  Upload,
} from "lucide-react";

import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent } from "@kody-ade/base/ui/card";
import { Checkbox } from "@kody-ade/base/ui/checkbox";
import { Label } from "@kody-ade/base/ui/label";

import { PageShell } from "./PageShell";
import { AuthGuard } from "../auth-guard";
import { useAuth, buildAuthHeaders } from "../auth-context";
import {
  buildImportRequests,
  mergeImportedCounts,
  type BackendDump,
} from "../backend/split-dump";

interface ImportResult {
  cleared: boolean;
  imported: Record<string, number>;
}

interface DumpSummary {
  tenantId: string;
  tableCount: number;
  docCount: number;
}

async function readErrorMessage(res: Response): Promise<string> {
  const json = (await res.json().catch(() => ({}))) as {
    error?: string;
    message?: string;
  };
  return json.message || json.error || `HTTP ${res.status}`;
}

function summarizeDump(dump: {
  tenantId: string;
  tables: Record<string, unknown[]>;
}): DumpSummary {
  const tables = Object.values(dump.tables);
  return {
    tenantId: dump.tenantId,
    tableCount: tables.length,
    docCount: tables.reduce((total, docs) => total + docs.length, 0),
  };
}

export function BackendManager() {
  return (
    <AuthGuard>
      <BackendManagerInner />
    </AuthGuard>
  );
}

function BackendManagerInner() {
  const { auth } = useAuth();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...buildAuthHeaders(auth),
  };

  const [exportingSource, setExportingSource] = useState<"convex" | null>(null);
  const [exportError, setExportError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dump, setDump] = useState<{
    fileName: string;
    body: string;
    summary: DumpSummary;
  } | null>(null);
  const [clearFirst, setClearFirst] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importProgress, setImportProgress] = useState<{
    current: number;
    total: number;
  } | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);

  async function handleExport() {
    setExportingSource("convex");
    setExportError(null);
    try {
      const res = await fetch("/api/kody/company/backend/export", { headers, cache: "no-store" });
      if (!res.ok) throw new Error(await readErrorMessage(res));
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `backend-export-${auth?.owner}-${auth?.repo}.json`;
      anchor.click();
      URL.revokeObjectURL(url);
      toast.success("Export downloaded");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to export backend data";
      setExportError(message);
      toast.error(message);
    } finally {
      setExportingSource(null);
    }
  }

  async function handleFileSelected(file: File | null) {
    setImportError(null);
    setImportResult(null);
    if (!file) {
      setDump(null);
      return;
    }
    try {
      const body = await file.text();
      const parsed = JSON.parse(body) as {
        version?: number;
        tenantId?: string;
        tables?: Record<string, unknown[]>;
      };
      if (parsed.version !== 1 || !parsed.tenantId || !parsed.tables) {
        throw new Error(
          "Not a backend export dump (expected version 1 with tenantId and tables).",
        );
      }
      setDump({
        fileName: file.name,
        body,
        summary: summarizeDump({
          tenantId: parsed.tenantId,
          tables: parsed.tables,
        }),
      });
    } catch (err) {
      setDump(null);
      setImportError(
        err instanceof Error ? err.message : "Could not read dump file",
      );
    }
  }

  async function handleImport() {
    if (!dump) return;
    setImporting(true);
    setImportError(null);
    setImportResult(null);
    try {
      // Split the dump into request bodies under the serverless body limit
      // (large dumps previously failed with HTTP 413).
      const parsed = JSON.parse(dump.body) as BackendDump;
      const requests = buildImportRequests(parsed, clearFirst);
      const partResults: Array<Record<string, number>> = [];
      let cleared = false;
      for (const [index, body] of requests.entries()) {
        setImportProgress({ current: index + 1, total: requests.length });
        const res = await fetch("/api/kody/company/backend/import", {
          method: "POST",
          headers,
          body: JSON.stringify(body),
        });
        if (!res.ok) {
          throw new Error(
            `Part ${index + 1}/${requests.length} failed: ${await readErrorMessage(res)}`,
          );
        }
        const json = (await res.json()) as ImportResult;
        cleared = cleared || json.cleared;
        partResults.push(json.imported);
      }
      setImportResult({
        cleared,
        imported: mergeImportedCounts(partResults),
      });
      toast.success("Import completed");
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to import backend data";
      setImportError(message);
      toast.error(message);
    } finally {
      setImporting(false);
      setImportProgress(null);
    }
  }

  return (
    <PageShell
      title="Backend"
      icon={Database}
      iconClassName="text-emerald-400"
      subtitle={auth ? `${auth.owner}/${auth.repo}` : undefined}
    >
      <div className="space-y-4 max-w-3xl">
        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Download className="w-4 h-4 text-emerald-400" />
              <h2 className="text-sm font-semibold">Export</h2>
            </div>
            <p className="text-sm text-white/60">
              Download this repo&apos;s data as a portable JSON backup from the live database.
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                size="sm"
                onClick={() => handleExport()}
                disabled={exportingSource !== null}
              >
                {exportingSource === "convex" ? (
                  <Loader2 className="w-4 h-4 animate-spin" />
                ) : (
                  <Download className="w-4 h-4" />
                )}
                {exportingSource === "convex"
                  ? "Exporting…"
                  : "Export (backup from database)"}
              </Button>
            </div>
            {exportError && (
              <p className="text-sm text-rose-300">{exportError}</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardContent className="p-5 space-y-3">
            <div className="flex items-center gap-2">
              <Upload className="w-4 h-4 text-sky-400" />
              <h2 className="text-sm font-semibold">Import</h2>
            </div>
            <p className="text-sm text-white/60">
              Load a dump JSON into the Convex backend. Requires CONVEX_URL to
              be configured on the server.
            </p>

            <input
              ref={fileInputRef}
              type="file"
              accept="application/json,.json"
              className="hidden"
              onChange={(event) =>
                handleFileSelected(event.target.files?.[0] ?? null)
              }
            />
            <div className="flex items-center gap-3">
              <Button
                size="sm"
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                disabled={importing}
              >
                <FileJson className="w-4 h-4" />
                Choose dump file
              </Button>
              {dump && (
                <span className="text-sm text-white/60">
                  {dump.fileName} — {dump.summary.tableCount} tables,{" "}
                  {dump.summary.docCount} docs ({dump.summary.tenantId})
                </span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <Checkbox
                id="backend-clear-first"
                checked={clearFirst}
                onCheckedChange={(value) => setClearFirst(value === true)}
                disabled={importing}
              />
              <Label htmlFor="backend-clear-first" className="text-sm">
                Clear existing data first
              </Label>
            </div>

            <Button
              size="sm"
              onClick={handleImport}
              disabled={!dump || importing}
            >
              {importing ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              {importing
                ? importProgress && importProgress.total > 1
                  ? `Importing… (part ${importProgress.current}/${importProgress.total})`
                  : "Importing…"
                : "Import"}
            </Button>

            {importError && (
              <p className="text-sm text-rose-300">{importError}</p>
            )}

            {importResult && (
              <div className="rounded-md border border-white/[0.08] bg-white/[0.03] p-3 text-sm space-y-1">
                <p className="text-emerald-300 font-medium">
                  Import completed
                  {importResult.cleared ? " (existing data cleared)" : ""}
                </p>
                <ul className="text-white/70">
                  {Object.entries(importResult.imported).map(
                    ([table, count]) => (
                      <li key={table}>
                        {table}: {count} docs
                      </li>
                    ),
                  )}
                </ul>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </PageShell>
  );
}
