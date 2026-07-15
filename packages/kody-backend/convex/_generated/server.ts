/* Placeholder until `npx convex dev` runs codegen — replaced automatically.
   Typed against the schema via DataModelFromSchemaDefinition so functions
   typecheck before the first deployment. */
import {
  actionGeneric,
  httpActionGeneric,
  internalActionGeneric,
  internalMutationGeneric,
  internalQueryGeneric,
  mutationGeneric,
  queryGeneric,
} from "convex/server"
import type {
  ActionBuilder,
  DataModelFromSchemaDefinition,
  MutationBuilder,
  QueryBuilder,
} from "convex/server"
import type schema from "../schema"

type DataModel = DataModelFromSchemaDefinition<typeof schema>

export const query = queryGeneric as QueryBuilder<DataModel, "public">
export const internalQuery = internalQueryGeneric as QueryBuilder<DataModel, "internal">
export const mutation = mutationGeneric as MutationBuilder<DataModel, "public">
export const internalMutation = internalMutationGeneric as MutationBuilder<DataModel, "internal">
export const action = actionGeneric as ActionBuilder<DataModel, "public">
export const internalAction = internalActionGeneric as ActionBuilder<DataModel, "internal">
export const httpAction = httpActionGeneric
