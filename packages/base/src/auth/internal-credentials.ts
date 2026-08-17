export const KODY_INTERNAL_CREDENTIAL_PREFIX = "KODY_INTERNAL_";

export function isInternalKodyCredential(name: string): boolean {
  return name.startsWith(KODY_INTERNAL_CREDENTIAL_PREFIX);
}
