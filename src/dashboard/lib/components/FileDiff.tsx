/**
 * @fileType component
 * @domain kody
 * @pattern file-diff
 * @ai-summary Renders a unified-diff patch string with line numbers and red/green hunks.
 */
"use client";

import { cn } from "../utils";

type DiffLine = {
  type: "context" | "add" | "del" | "hunk";
  text: string;
  oldNum?: number;
  newNum?: number;
};

function parsePatch(patch: string): DiffLine[] {
  const lines: DiffLine[] = [];
  let oldNum = 0;
  let newNum = 0;

  for (const raw of patch.split("\n")) {
    if (raw.startsWith("@@")) {
      // @@ -oldStart,oldLines +newStart,newLines @@ optional context
      const match = raw.match(/^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/);
      if (match) {
        oldNum = parseInt(match[1], 10);
        newNum = parseInt(match[2], 10);
      }
      lines.push({ type: "hunk", text: raw });
      continue;
    }
    if (raw.startsWith("+") && !raw.startsWith("+++")) {
      lines.push({ type: "add", text: raw.slice(1), newNum });
      newNum++;
    } else if (raw.startsWith("-") && !raw.startsWith("---")) {
      lines.push({ type: "del", text: raw.slice(1), oldNum });
      oldNum++;
    } else if (raw.startsWith(" ")) {
      lines.push({ type: "context", text: raw.slice(1), oldNum, newNum });
      oldNum++;
      newNum++;
    } else if (raw.startsWith("\\")) {
      // "\ No newline at end of file" — render as context, no number bump
      lines.push({ type: "context", text: raw });
    }
  }
  return lines;
}

interface FileDiffProps {
  patch: string;
}

export function FileDiff({ patch }: FileDiffProps) {
  const lines = parsePatch(patch);

  return (
    <div className="font-mono text-xs leading-5 overflow-x-auto bg-zinc-950/50 border border-zinc-800 rounded">
      <table className="w-full border-collapse">
        <tbody>
          {lines.map((line, i) => {
            if (line.type === "hunk") {
              return (
                <tr key={i} className="bg-blue-500/10 text-blue-300">
                  <td colSpan={3} className="px-3 py-1 select-none">
                    {line.text}
                  </td>
                </tr>
              );
            }
            const bg =
              line.type === "add"
                ? "bg-green-500/10"
                : line.type === "del"
                  ? "bg-red-500/10"
                  : "";
            const sign =
              line.type === "add" ? "+" : line.type === "del" ? "-" : " ";
            return (
              <tr key={i} className={cn(bg, "hover:bg-zinc-800/40")}>
                <td className="px-2 text-right text-zinc-600 select-none w-12 align-top">
                  {line.oldNum ?? ""}
                </td>
                <td className="px-2 text-right text-zinc-600 select-none w-12 align-top border-r border-zinc-800">
                  {line.newNum ?? ""}
                </td>
                <td className="px-3 whitespace-pre text-zinc-200">
                  <span
                    className={cn(
                      "select-none mr-2",
                      line.type === "add"
                        ? "text-green-400"
                        : line.type === "del"
                          ? "text-red-400"
                          : "text-zinc-600",
                    )}
                  >
                    {sign}
                  </span>
                  {line.text}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
