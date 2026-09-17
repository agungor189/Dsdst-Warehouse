import type { NextFunction, Request, Response } from "express";

export type LoginRateLimitOptions = {
  windowMs?: number;
  maxAttempts?: number;
};

type Attempt = { failures: number; resetAt: number };

const normalizedUsername = (req: Request) => (
  typeof req.body?.username === "string"
    ? req.body.username.trim().toLowerCase().slice(0, 254)
    : "<missing>"
);

export function createLoginRateLimit(options: LoginRateLimitOptions = {}) {
  const windowMs = options.windowMs ?? 15 * 60 * 1000;
  const maxAttempts = options.maxAttempts ?? 10;
  const attempts = new Map<string, Attempt>();

  return (req: Request, res: Response, next: NextFunction) => {
    const now = Date.now();
    const key = `${req.ip || req.socket.remoteAddress || "unknown"}\n${normalizedUsername(req)}`;
    let attempt = attempts.get(key);
    if (attempt && attempt.resetAt <= now) {
      attempts.delete(key);
      attempt = undefined;
    }

    if (attempt && attempt.failures >= maxAttempts) {
      const retryAfter = Math.max(1, Math.ceil((attempt.resetAt - now) / 1000));
      res.setHeader("Retry-After", String(retryAfter));
      res.setHeader("RateLimit-Limit", String(maxAttempts));
      res.setHeader("RateLimit-Remaining", "0");
      return res.status(429).json({
        success: false,
        error: { code: "TOO_MANY_REQUESTS", message: "Çok fazla başarısız giriş denemesi. Lütfen daha sonra tekrar deneyin." },
      });
    }

    res.once("finish", () => {
      if (res.statusCode === 401 || res.statusCode === 403) {
        const current = attempts.get(key);
        attempts.set(key, current && current.resetAt > Date.now()
          ? { ...current, failures: current.failures + 1 }
          : { failures: 1, resetAt: Date.now() + windowMs });
      } else if (res.statusCode >= 200 && res.statusCode < 400) {
        attempts.delete(key);
      }

      if (attempts.size > 10_000) {
        const cleanupNow = Date.now();
        for (const [storedKey, storedAttempt] of attempts) {
          if (storedAttempt.resetAt <= cleanupNow) attempts.delete(storedKey);
        }
      }
    });

    res.setHeader("RateLimit-Limit", String(maxAttempts));
    res.setHeader("RateLimit-Remaining", String(Math.max(0, maxAttempts - (attempt?.failures || 0))));
    next();
  };
}
