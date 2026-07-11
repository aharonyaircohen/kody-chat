import "server-only";

import "mongodb";

/**
 * Remote Store adapters are materialized into /tmp and imported from there.
 * Keep their package dependencies visible to per-route serverless tracing.
 */
export const CMS_RUNTIME_DEPS_ANCHORED = true;
