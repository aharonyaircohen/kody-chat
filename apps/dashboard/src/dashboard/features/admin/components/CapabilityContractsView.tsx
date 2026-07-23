"use client";

import { useMemo } from "react";
import { useRouter } from "next/navigation";
import { FileJson2, Loader2, RefreshCw } from "lucide-react";
import type { CapabilityDefinition } from "@kody-ade/agency-domain";

import { currentAgencyDefinitions } from "@kody-ade/agency/agency-model-read";
import { Badge } from "@kody-ade/base/ui/badge";
import { Button } from "@kody-ade/base/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@kody-ade/base/ui/card";
import { EmptyState } from "@dashboard/lib/components/EmptyState";
import { selectionPath } from "@dashboard/lib/selection-routing";
import { useAgencyDefinitions } from "@dashboard/lib/hooks/useAgencyModel";

export function CapabilityContractsView({
  selectedId,
}: {
  selectedId?: string;
}) {
  const router = useRouter();
  const definitions = useAgencyDefinitions();
  const records = useMemo(
    () =>
      currentAgencyDefinitions(definitions.data ?? []).filter(
        (record) => record.kind === "capability",
      ),
    [definitions.data],
  );
  const selected =
    records.find((record) => record.data.id === selectedId) ?? null;

  if (definitions.isLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (definitions.error) {
    return (
      <EmptyState
        icon={<RefreshCw className="h-5 w-5" />}
        title="Could not load Capability Contracts"
        hint={definitions.error.message}
        action={
          <Button onClick={() => void definitions.refetch()}>Retry</Button>
        }
      />
    );
  }

  return (
    <div className="grid min-h-0 flex-1 lg:grid-cols-[minmax(18rem,24rem)_1fr]">
      <aside className="border-r border-border/70">
        <header className="border-b border-border/70 p-4">
          <h1 className="text-xl font-semibold">Capability Contracts</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            {records.length} canonical action contracts
          </p>
        </header>
        {records.length === 0 ? (
          <EmptyState
            icon={<FileJson2 className="h-5 w-5" />}
            title="No Capability Contracts"
            hint="Install a Capability from the Store to add its contract."
          />
        ) : (
          <div className="divide-y divide-border/60">
            {records.map((record) => {
              const capability =
                record.data as unknown as CapabilityDefinition;
              return (
                <Button
                  key={record.recordId}
                  type="button"
                  variant="ghost"
                  className={`h-auto w-full justify-start rounded-none px-4 py-4 text-left whitespace-normal hover:bg-muted/40 ${
                    selected?.recordId === record.recordId ? "bg-muted/60" : ""
                  }`}
                  onClick={() =>
                    router.push(
                      selectionPath("/capability-contracts", capability.id),
                    )
                  }
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="truncate font-mono text-sm font-medium">
                        {capability.id}
                      </span>
                      <Badge variant="outline">{capability.action}</Badge>
                    </div>
                    <p className="mt-2 line-clamp-2 text-sm text-muted-foreground">
                      {capability.purpose}
                    </p>
                  </div>
                </Button>
              );
            })}
          </div>
        )}
      </aside>
      <main className="min-w-0 p-4 md:p-8">
        {selected ? (
          <CapabilityContractDetail
            capability={selected.data as unknown as CapabilityDefinition}
            revision={selected.recordId.split(":").at(-1) ?? ""}
          />
        ) : (
          <EmptyState
            icon={<FileJson2 className="h-5 w-5" />}
            title="Select a Capability Contract"
            hint="Choose a contract to inspect its inputs, outputs, effects, and permissions."
          />
        )}
      </main>
    </div>
  );
}

function CapabilityContractDetail({
  capability,
  revision,
}: {
  capability: CapabilityDefinition;
  revision: string;
}) {
  return (
    <div className="space-y-6">
      <header>
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-mono text-2xl font-semibold">{capability.id}</h2>
          <Badge>{capability.action}</Badge>
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          {capability.purpose}
        </p>
        <p className="mt-2 break-all font-mono text-xs text-muted-foreground">
          Revision {revision}
        </p>
      </header>

      <div className="grid gap-4 md:grid-cols-2">
        <ValueCard title="Success">{capability.success}</ValueCard>
        <ValueCard title="Failure">{capability.failure}</ValueCard>
        <ListCard title="Effects" values={capability.effects} />
        <ListCard title="Permissions" values={capability.permissions} />
      </div>

      <SchemaCard title="Input contract" value={capability.inputSchema} />
      <SchemaCard title="Output contract" value={capability.outputSchema} />
    </div>
  );
}

function ValueCard({
  title,
  children,
}: {
  title: string;
  children: string;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="text-sm text-muted-foreground">
        {children || "None"}
      </CardContent>
    </Card>
  );
}

function ListCard({ title, values }: { title: string; values: string[] }) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-wrap gap-2">
        {values.length > 0 ? (
          values.map((value) => (
            <Badge key={value} variant="outline">
              {value}
            </Badge>
          ))
        ) : (
          <span className="text-sm text-muted-foreground">None</span>
        )}
      </CardContent>
    </Card>
  );
}

function SchemaCard({
  title,
  value,
}: {
  title: string;
  value: Record<string, unknown>;
}) {
  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm">{title}</CardTitle>
      </CardHeader>
      <CardContent>
        <pre className="max-h-96 overflow-auto rounded-lg bg-muted/50 p-4 font-mono text-xs">
          {JSON.stringify(value, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}
