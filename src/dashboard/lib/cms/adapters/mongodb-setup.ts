import { z } from "zod";

import type { CmsSetupAdapter } from "./types";
import { CmsAdapterSetupError } from "./types";

function trimmed<T extends z.ZodTypeAny>(schema: T) {
  return z.preprocess(
    (value) => (typeof value === "string" ? value.trim() : value),
    schema,
  );
}

const optionalTrimmedString = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const trimmedValue = value.trim();
  return trimmedValue.length > 0 ? trimmedValue : undefined;
}, z.string().max(120).optional());

const mongoCmsSetupSchema = z.object({
  name: trimmed(z.string().min(1).max(120)).default("CMS"),
  databaseUriSecret: trimmed(
    z
      .string()
      .min(1)
      .max(120)
      .regex(/^[A-Z][A-Z0-9_]*$/, {
        message: "Use an env secret name like DATABASE_URL.",
      }),
  ),
  databaseName: optionalTrimmedString,
  collectionName: trimmed(
    z
      .string()
      .min(1)
      .max(80)
      .regex(/^[A-Za-z0-9_.-]+$/, {
        message: "Use only letters, numbers, dots, dashes, or underscores.",
      }),
  ),
  collectionLabel: optionalTrimmedString,
  idField: trimmed(z.string().min(1).max(80)).default("_id"),
  titleField: trimmed(z.string().min(1).max(80)).default("title"),
});

type MongoCmsSetupInput = z.infer<typeof mongoCmsSetupSchema>;

export const mongoCmsSetupAdapter: CmsSetupAdapter = {
  name: "mongodb",
  create(payload) {
    const parsed = mongoCmsSetupSchema.safeParse(payload);
    if (!parsed.success) {
      throw new CmsAdapterSetupError(
        "invalid_body",
        formatZodIssues(parsed.error.issues),
        { issues: parsed.error.issues },
      );
    }

    return {
      cms: {
        configured: true,
        version: 1,
        name: parsed.data.name,
        environment: "dev",
        defaultAdapter: "mongodb",
        writePolicy: "enabled",
        collections: [],
      },
      files: buildMongoCmsSetupFiles(parsed.data),
      commitMessage: `chore(cms): Configure ${parsed.data.collectionName}`,
    };
  },
};

function buildMongoCmsSetupFiles(input: MongoCmsSetupInput) {
  const collectionPath = `collections/${input.collectionName}.json`;
  const collectionLabel = input.collectionLabel?.trim() || input.collectionName;
  const fields = uniqueFields([
    { name: input.idField, type: "id", label: "ID", readOnly: true },
    { name: input.titleField, type: "text", label: "Title" },
  ]);

  return [
    {
      path: "cms/environments/dev.json",
      content: {
        name: "dev",
        adapter: "mongodb",
        databaseUriSecret: input.databaseUriSecret,
        ...(input.databaseName ? { databaseName: input.databaseName } : {}),
        writePolicy: "enabled",
      },
    },
    {
      path: `cms/${collectionPath}`,
      content: {
        name: input.collectionName,
        label: collectionLabel,
        adapter: "mongodb",
        source: {
          collection: input.collectionName,
          idField: input.idField,
        },
        titleField: input.titleField,
        searchFields:
          input.titleField === input.idField ? [] : [input.titleField],
        writePolicy: "enabled",
        operations: {
          list: true,
          get: true,
          search: true,
          create: true,
          update: true,
          delete: true,
        },
        fields,
        views: {
          list: {
            fields: [
              { name: input.titleField, role: "primary", width: "fill" },
            ],
          },
          detail: {
            fields: fields.map((field) => ({ name: String(field.name) })),
          },
          form: {
            fields: fields
              .filter((field) => field.name !== input.idField)
              .map((field) => ({ name: String(field.name) })),
          },
        },
        filters:
          input.titleField === input.idField
            ? []
            : [{ field: input.titleField, operators: ["contains", "equals"] }],
        defaultSort: [],
      },
    },
    {
      path: "cms/config.json",
      content: {
        version: 1,
        name: input.name,
        environment: "dev",
        environmentFile: "environments/dev.json",
        defaultAdapter: "mongodb",
        writePolicy: "enabled",
        collections: [collectionPath],
      },
    },
  ];
}

function uniqueFields(fields: Array<Record<string, unknown>>) {
  const seen = new Set<string>();
  return fields.filter((field) => {
    const name = String(field.name ?? "");
    if (!name || seen.has(name)) return false;
    seen.add(name);
    return true;
  });
}

function formatZodIssues(issues: z.ZodIssue[]) {
  return issues
    .map((issue) => {
      const path = issue.path.length ? `${issue.path.join(".")}: ` : "";
      return `${path}${issue.message}`;
    })
    .join("; ");
}
