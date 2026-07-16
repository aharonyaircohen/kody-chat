/**
 * @file Vitest setup that clears KODY_SERVICE_KEY for the duration of the
 * test process. The Convex backend's withEscapedKeys Proxy injects this key
 * into every call when set in the environment, which breaks tests that
 * assert args via `toEqual` (they see an unexpected `serviceKey` field).
 *
 * Real CI does not set KODY_SERVICE_KEY; this only matters when the
 * variable leaks into the test runner's environment (e.g. from the verify
 * tool's secrets). Clearing it here keeps tests independent of that
 * leakage without weakening any assertion.
 */
delete process.env.KODY_SERVICE_KEY;