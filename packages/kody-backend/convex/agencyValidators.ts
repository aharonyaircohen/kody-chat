import { v } from "convex/values";

export const agencyRunSubjectTypeValidator = v.union(
  v.literal("loop"),
  v.literal("workflow"),
  v.literal("capability"),
);
