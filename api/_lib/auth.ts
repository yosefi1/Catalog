import type { VercelRequest, VercelResponse } from '@vercel/node';

export function requireCatalogKey(
  req: VercelRequest,
  res: VercelResponse,
): boolean {
  const expected = process.env.CATALOG_ACCESS_KEY;
  if (!expected) {
    res.status(500).json({
      error: 'Server missing CATALOG_ACCESS_KEY env var',
    });
    return false;
  }

  const provided =
    (req.headers['x-catalog-key'] as string | undefined) ||
    (typeof req.body?.accessKey === 'string' ? req.body.accessKey : undefined);

  if (!provided || provided !== expected) {
    res.status(401).json({ error: 'Invalid or missing catalog sync key' });
    return false;
  }
  return true;
}

export function setCors(res: VercelResponse): void {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
  res.setHeader(
    'Access-Control-Allow-Headers',
    'Content-Type, X-Catalog-Key',
  );
}
