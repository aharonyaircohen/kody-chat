import { v } from "convex/values";

export const agencyRunSubjectTypeValidator = v.union(
  v.literal("goal"),
  v.literal("loop"),
  v.literal("workflow"),
  v.literal("capability"),
);
