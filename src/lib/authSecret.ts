/**
 * NextAuth JWT + middleware must use the same secret.
 * Prefer AUTH_SECRET (NextAuth also reads NEXTAUTH_SECRET in many setups).
 */
export function getAuthSecret(): string | undefined {
  const fromEnv = process.env.AUTH_SECRET?.trim() || process.env.NEXTAUTH_SECRET?.trim();
  if (fromEnv) return fromEnv;
  if (process.env.NODE_ENV === "development") {
    // Stable dev default so login works before .env is fully configured; set AUTH_SECRET in production.
    return "dev-only-auth-secret-set-AUTH_SECRET-in-env-local";
  }
  return undefined;
}
