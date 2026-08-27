import { env } from "cloudflare:workers";

export function requestIp(request: Request) {
  return request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "local";
}

export function bodyTooLarge(request: Request, maximumBytes: number) {
  const length = Number(request.headers.get("content-length") || 0);
  return Number.isFinite(length) && length > maximumBytes;
}

export async function rateLimit(request: Request, scope: string, limit: number, windowSeconds: number) {
  const now = Math.floor(Date.now() / 1000);
  const windowStart = now - (now % windowSeconds);
  const key = `${scope}:${requestIp(request)}`;
  const result = await env.DB.prepare(`
    INSERT INTO rate_limits (key, window_start, count)
    VALUES (?1, ?2, 1)
    ON CONFLICT(key) DO UPDATE SET
      window_start = CASE WHEN rate_limits.window_start < ?2 THEN ?2 ELSE rate_limits.window_start END,
      count = CASE WHEN rate_limits.window_start < ?2 THEN 1 ELSE rate_limits.count + 1 END
    RETURNING count
  `).bind(key, windowStart).first<{ count: number }>();
  return { allowed: Number(result?.count ?? 1) <= limit, retryAfter: windowSeconds - (now - windowStart) };
}

export function rateLimitResponse(retryAfter: number) {
  return Response.json({ error: "Hiciste demasiados intentos. Esperá unos minutos y volvé a probar." }, { status: 429, headers: { "retry-after": String(retryAfter) } });
}
