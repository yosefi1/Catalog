import type { VercelRequest, VercelResponse } from '@vercel/node';

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,DELETE,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Catalog-Key, Authorization',
  );
}

export function parseBody(req: VercelRequest): Record<string, unknown> {
  if (!req.body) return {};
  if (typeof req.body === 'string') {
    try {
      return JSON.parse(req.body) as Record<string, unknown>;
    } catch {
      return {};
    }
  }
  if (typeof req.body === 'object') return req.body as Record<string, unknown>;
  return {};
}

export function getCatalogKey(
  req: VercelRequest,
  body: Record<string, unknown>,
): string | undefined {
  const header =
    (req.headers['x-catalog-key'] as string | undefined) ||
    (req.headers.authorization?.replace(/^Bearer\s+/i, '') ?? undefined);
  if (header) return header;
  if (typeof body.accessKey === 'string') return body.accessKey;
  return undefined;
}

export function requireCatalogKey(
  req: VercelRequest,
  res: VercelResponse,
  body: Record<string, unknown>,
): boolean {
  const expected = process.env.CATALOG_ACCESS_KEY;
  if (!expected) {
    res.status(500).json({
      error:
        'Server missing CATALOG_ACCESS_KEY. Add it in Vercel → Settings → Environment Variables, then Redeploy.',
    });
    return false;
  }

  const provided = getCatalogKey(req, body);
  if (!provided || provided !== expected) {
    res.status(401).json({
      error: 'Invalid access key.',
    });
    return false;
  }
  return true;
}

export function errMessage(e: unknown): string {
  if (e instanceof Error) return e.message;
  if (e && typeof e === 'object') {
    const o = e as {
      message?: string;
      error?: string;
      details?: string;
      hint?: string;
      code?: string;
    };
    return (
      [o.message || o.error, o.details, o.hint, o.code]
        .filter(Boolean)
        .join(' | ') || JSON.stringify(e)
    );
  }
  return String(e);
}
