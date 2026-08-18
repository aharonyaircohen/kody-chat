export function getKodyAuthToken() {
  // Generate a token using KODY_MASTER_KEY
  const key = process.env.KODY_MASTER_KEY || 'fallback-key';
  // In production, this should securely generate a signed token
  return `kody-auth-${Date.now()}`;
}