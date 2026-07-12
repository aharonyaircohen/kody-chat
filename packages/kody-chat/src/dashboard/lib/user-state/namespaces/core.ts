/**
 * @fileType utility
 * @domain user-state
 * @pattern user-state-core-namespaces
 * @ai-summary The core user-state namespaces shipped by kody: profile,
 *   progress, selections, stats. Brands cannot override these — custom
 *   namespaces come from `user-state/config.json` in the brand state repo.
 */
import { z } from "zod";
import type { UserStateNamespace } from "../types";

const profileSchema = z
  .object({
    displayName: z.string().trim().max(200).optional(),
    locale: z.string().trim().max(20).optional(),
    avatarUrl: z.string().url().optional(),
    timezone: z.string().trim().max(60).optional(),
  })
  .strict();

const progressSchema = z.record(
  z.string().min(1),
  z.union([z.string().max(500), z.number(), z.boolean()]),
);

const selectionsSchema = z.record(
  z.string().min(1),
  z.union([z.string().max(2000), z.array(z.string().max(2000)).max(100)]),
);

const statsSchema = z.record(z.string().min(1), z.number());

/**
 * Event history: one list of full event records per key (the trigger id).
 * Each record is the event's data plus `event` and `at` bookkeeping.
 */
const historySchema = z.record(
  z.string().min(1),
  z.array(z.record(z.string(), z.unknown())).max(200),
);

export const CORE_USER_STATE_NAMESPACES: readonly UserStateNamespace[] = [
  {
    name: "profile",
    version: 1,
    origin: "core",
    schema: profileSchema,
    adapter: "state-repo",
    merge: "shallow-merge",
    modelWritable: false,
  },
  {
    name: "progress",
    version: 1,
    origin: "core",
    schema: progressSchema,
    adapter: "state-repo",
    merge: "shallow-merge",
    modelWritable: true,
  },
  {
    name: "selections",
    version: 1,
    origin: "core",
    schema: selectionsSchema,
    adapter: "state-repo",
    merge: "shallow-merge",
    modelWritable: true,
  },
  {
    name: "stats",
    version: 1,
    origin: "core",
    schema: statsSchema,
    adapter: "state-repo",
    merge: "shallow-merge",
    modelWritable: true,
  },
  {
    name: "history",
    version: 1,
    origin: "core",
    schema: historySchema,
    adapter: "state-repo",
    merge: "shallow-merge",
    modelWritable: false,
  },
];
