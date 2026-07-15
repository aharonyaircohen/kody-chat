// Back-compat façade — the real definitions live in the entity registry.
// Add new entities in src/entities.ts, never here.
export {
  ENTITIES,
  IMPORTABLE_TABLES,
  STATE_ROOTS,
  mapStateFile,
  parseJsonl,
  type EntityDef,
  type MappedRow,
} from "./entities"
