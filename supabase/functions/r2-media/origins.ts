// Web origins are exact matches. Native clients omit Origin but still require JWT + RLS.
export function r2OriginHeaders(requestOrigin: string | null, configured: string) {
  const origins = configured.split(',').map(value => value.trim()).filter(Boolean);
  if (!origins.length || (requestOrigin !== null && !origins.includes(requestOrigin))) return null;
  return {
    'Access-Control-Allow-Origin': requestOrigin ?? origins[0],
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-micole-support',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Vary': 'Origin',
    'Content-Type': 'application/json',
  };
}
