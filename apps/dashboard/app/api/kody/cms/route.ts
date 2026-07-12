/** Route re-export — implementation lives in @kody-ade/cms. */
export * from "@kody-ade/cms/routes/index";

// Next.js segment config must be declared literally in the app route file —
// re-exported consts are ignored by Next.js static analysis. Mirrors @kody-ade/cms/routes/index.
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;
