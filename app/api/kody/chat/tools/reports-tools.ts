/**
 * @fileType util
 * @domain reports
 * @pattern chat-tools
 * @ai-summary Read-only chat tools for goal/loop reports
 *   (`reports/<slug>.md` in the configured Kody state repo) — list and read.
 *   Reports are the Dashboard-facing summaries produced after goals/loops apply evidence.
 */
import { tool } from "ai";
import { z } from "zod";
import {
  listReportFiles,
  readReportFile,
  isValidSlug,
} from "@dashboard/lib/reports-files";

export function createReportTools(opts: { owner: string; repo: string }) {
  const repoRef = `${opts.owner}/${opts.repo}`;
  return {
    list_reports: tool({
      description: `List the goal/loop reports in ${repoRef} (state repo reports/). Returns slug, title, and last-updated for each report.`,
      inputSchema: z.object({}),
      execute: async () => {
        try {
          const reports = await listReportFiles();
          return {
            reports: reports.map((r) => ({
              slug: r.slug,
              title: r.title,
              updatedAt: r.updatedAt,
            })),
          };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),

    read_report: tool({
      description: `Read one goal/loop report from ${repoRef} in full.`,
      inputSchema: z.object({ slug: z.string().min(1).max(64) }),
      execute: async ({ slug }) => {
        if (!isValidSlug(slug)) return { error: `invalid slug "${slug}"` };
        try {
          const report = await readReportFile(slug);
          if (!report) return { error: `report "${slug}" not found` };
          return { report };
        } catch (err) {
          return { error: err instanceof Error ? err.message : String(err) };
        }
      },
    }),
  };
}
