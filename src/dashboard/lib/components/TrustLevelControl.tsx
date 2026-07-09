"use client";

import { Loader2, ShieldAlert, ShieldCheck, Zap } from "lucide-react";

import { Button } from "@dashboard/ui/button";
import type { TrustLevel } from "../cto/trust-state";
import { cn } from "../utils";

const trustLevelOptions: Array<{
  value: TrustLevel;
  label: string;
  Icon: typeof ShieldAlert;
}> = [
  { value: "approval-required", label: "Require approval", Icon: ShieldAlert },
  { value: "can-run", label: "Kody can run", Icon: Zap },
  { value: "auto-approval", label: "Auto approval", Icon: ShieldCheck },
];

export function TrustLevelControl({
  value,
  pending = false,
  onChange,
}: {
  value: TrustLevel;
  pending?: boolean;
  onChange: (value: TrustLevel) => void;
}) {
  return (
    <div
      className="inline-flex min-w-0 flex-wrap items-center rounded-md border border-border bg-background p-0.5"
      role="group"
      aria-label="Trust level"
    >
      {trustLevelOptions.map(({ value: option, label, Icon }) => {
        const selected = value === option;
        return (
          <Button
            key={option}
            type="button"
            variant={selected ? "secondary" : "ghost"}
            size="sm"
            className={cn(
              "h-8 gap-1.5 rounded px-2 text-xs",
              selected &&
                "border-emerald-500/30 bg-emerald-500/10 text-emerald-300",
              pending && "cursor-not-allowed opacity-60",
            )}
            aria-pressed={selected}
            aria-disabled={pending}
            aria-label={`Trust level: ${label}`}
            title={label}
            onClick={() => {
              if (pending || selected) return;
              onChange(option);
            }}
          >
            {pending && selected ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5" />
            )}
            <span>{label}</span>
          </Button>
        );
      })}
    </div>
  );
}
