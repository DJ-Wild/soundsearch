import crypto from 'node:crypto';
import type { Request, Response, NextFunction } from 'express';

/**
 * Extracts API key from request headers.
 * Supports:
 * - Authorization: Bearer <key>
 * - Authorization: <key>
 * - x-api-key: <key>
 * - X-API-KEY: <key>
 */
export function extractApiKey(req: Request): string | null {
  const authHeader = req.get('Authorization') || req.get('authorization');
  if (authHeader) {
    const trimmed = authHeader.trim();
    if (trimmed.toLowerCase().startsWith('bearer ')) {
      return trimmed.slice(7).trim();
    }
    return trimmed;
  }

  const xApiKey = req.get('x-api-key') || req.get('X-API-KEY');
  if (xApiKey && typeof xApiKey === 'string') {
    return xApiKey.trim();
  }

  return null;
}

/**
 * Timing-safe string comparison to prevent timing attacks.
 */
export function safeCompareKeys(providedKey: string, configuredKey: string): boolean {
  if (!providedKey || !configuredKey) return false;

  const providedHash = crypto.createHash('sha256').update(providedKey).digest();
  const configuredHash = crypto.createHash('sha256').update(configuredKey).digest();

  return crypto.timingSafeEqual(providedHash, configuredHash);
}

/**
 * Middleware for external REST API endpoints.
 * Requires a valid ADMIN_API_KEY provided via Bearer token or x-api-key header.
 */
export function requireApiKey(req: Request, res: Response, next: NextFunction) {
  const configuredKey = process.env.ADMIN_API_KEY;

  if (!configuredKey || configuredKey.trim() === '') {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'ADMIN_API_KEY is not configured on the server. Please define ADMIN_API_KEY in .env file.',
    });
    return;
  }

  const providedKey = extractApiKey(req);

  if (!providedKey) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: "Missing API key. Provide it via 'Authorization: Bearer <key>' or 'x-api-key' header.",
    });
    return;
  }

  const isValid = safeCompareKeys(providedKey, configuredKey.trim());

  if (!isValid) {
    res.status(401).json({
      success: false,
      error: 'Unauthorized',
      message: 'Invalid API key provided.',
    });
    return;
  }

  next();
}
