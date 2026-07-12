/** Route re-export — implementation lives in @kody-ade/workspace. */
export * from "@kody-ade/workspace/routes/commands";

// Next.js segment config must be declared literally in the app route file —
// re-exported consts are ignored by Next.js static analysis. Mirrors @kody-ade/workspace/routes/commands.
export const dynamic = "force-dynamic";
export const revalidate = 0;
