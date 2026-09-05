/**
 * Origin allow-list shared by the Express CORS layer, Better Auth and Socket.IO.
 *
 * Production is driven entirely by env (FRONTEND_URL, plus an optional
 * comma-separated ALLOWED_ORIGINS); the localhost defaults are only added
 * outside production so a deployed instance never trusts a dev origin.
 */
const DEV_ORIGINS = ["http://localhost:3000", "http://localhost:8000"];

export function allowedOrigins(): string[] {
  const fromEnv = [
    process.env.FRONTEND_URL,
    ...(process.env.ALLOWED_ORIGINS?.split(",") ?? []),
  ]
    .map((o) => o?.trim())
    .filter((o): o is string => Boolean(o));

  const origins =
    process.env.NODE_ENV === "production" ? fromEnv : [...fromEnv, ...DEV_ORIGINS];

  if (origins.length === 0) {
    console.warn(
      "[config] No FRONTEND_URL/ALLOWED_ORIGINS set in production — all browser origins will be rejected."
    );
  }

  return Array.from(new Set(origins));
}
