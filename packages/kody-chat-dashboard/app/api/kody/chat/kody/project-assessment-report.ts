import { containsToolCallMarkup } from "@kody-ade/kody-chat-dashboard/core/tool-call-strip";

const REQUIRED_SECTIONS = [
  "Executive verdict",
  "Product readiness",
  "Ranked risks",
  "Maintenance capacity gap",
  "Why Kody matters",
  "Kody coverage and proof",
  "Advanced continuous QA",
  "Recommended 30-day decisions",
  "Recommended 90-day outcomes",
  "Technical assessment",
  "Specialist findings and evidence",
] as const;

const EXECUTIVE_PARTS = [
  "Current state",
  "Main risk",
  "Maintenance capacity",
  "Kody's value",
  "Next step",
] as const;

const RISK_PARTS = [
  "Severity",
  "Business impact",
  "Evidence",
  "Action",
] as const;

const RAW_TOOL_CALL_JSON =
  /(?:^|\n)\s*\{\s*"name"\s*:\s*"[^"]+"\s*,\s*"arguments"\s*:/i;

export type ProjectAssessmentValidationReason =
  | "empty_report"
  | "unfinished_output"
  | "tool_call_output"
  | "missing_section"
  | "empty_section"
  | "missing_executive_part"
  | "missing_risk_part";

export type ProjectAssessmentValidation =
  | { valid: true }
  | {
      valid: false;
      reason: ProjectAssessmentValidationReason;
      detail?: string;
    };

export const INVALID_PROJECT_ASSESSMENT_MESSAGE =
  "Final report writing failed because the report was incomplete. The specialist findings were preserved and can be used for another writing attempt.";

function sectionBody(text: string, section: string): string | null {
  const escaped = section.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = new RegExp(
    `^##\\s+${escaped}\\s*$([\\s\\S]*?)(?=^##\\s+|$(?![\\s\\S]))`,
    "im",
  ).exec(text);
  return match?.[1]?.trim() ?? null;
}

export function validateProjectAssessmentReport({
  text,
  finishReason,
}: {
  text: string;
  finishReason?: string;
}): ProjectAssessmentValidation {
  const report = text.trim();
  if (!report) return { valid: false, reason: "empty_report" };
  if (finishReason && finishReason.toLowerCase() !== "stop") {
    return {
      valid: false,
      reason: "unfinished_output",
      detail: finishReason,
    };
  }
  if (containsToolCallMarkup(report) || RAW_TOOL_CALL_JSON.test(report)) {
    return { valid: false, reason: "tool_call_output" };
  }
  for (const section of REQUIRED_SECTIONS) {
    const body = sectionBody(report, section);
    if (body === null) {
      return { valid: false, reason: "missing_section", detail: section };
    }
    if (!body) {
      return { valid: false, reason: "empty_section", detail: section };
    }
  }
  const executive = sectionBody(report, "Executive verdict") ?? "";
  for (const part of EXECUTIVE_PARTS) {
    if (!executive.includes(`**${part}:**`)) {
      return {
        valid: false,
        reason: "missing_executive_part",
        detail: part,
      };
    }
  }
  const risks = sectionBody(report, "Ranked risks") ?? "";
  for (const part of RISK_PARTS) {
    if (!risks.includes(`**${part}:**`)) {
      return { valid: false, reason: "missing_risk_part", detail: part };
    }
  }
  return { valid: true };
}
