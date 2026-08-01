/**
 * @fileType component
 * @domain onboarding
 * @pattern first-run-welcome
 * @ai-summary Repository-free first-run page. Chat owns the onboarding
 *   guidance; this page offers the single action that starts it.
 */
"use client";

import { Sparkles } from "lucide-react";
import { useRouter } from "next/navigation";

import { Button } from "@kody-ade/base/ui/button";
import { PageShell } from "@dashboard/lib/components/PageShell";
import { ONBOARDING_FLOW_ID } from "@kody-ade/kody-chat-dashboard/guided-flows/registry";

export function WelcomeSetup() {
  const router = useRouter();

  const startOnboarding = () => {
    router.push(`/chat?guidedFlow=${ONBOARDING_FLOW_ID}`);
  };

  return (
    <PageShell
      title="Welcome to Kody"
      icon={Sparkles}
      iconClassName="text-teal-300"
    >
      <div className="max-w-xl space-y-5">
        <p className="text-base leading-7 text-muted-foreground">
          Chat will guide you through connecting your first repository and
          activating your first model.
        </p>
        <Button onClick={startOnboarding}>Start onboarding</Button>
      </div>
    </PageShell>
  );
}
