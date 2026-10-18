import { describe, expect, it } from 'vitest';
import { r2OriginHeaders } from '../supabase/functions/r2-media/origins';

describe('R2 origins for web and native clients', () => {
  const origins = 'https://micole-web.vercel.app, http://localhost:5173,http://localhost:5175';
  it('allows the published web and configured local origins with exact response headers', () => {
    for (const origin of origins.split(',').map(value => value.trim())) {
      expect(r2OriginHeaders(origin, origins)?.['Access-Control-Allow-Origin']).toBe(origin);
    }
  });
  it('rejects suffix attacks, opaque origins and unconfigured previews', () => {
    for (const origin of ['null', 'https://micole-web.vercel.app.evil.com', 'https://preview.vercel.app', 'http://localhost:8081']) {
      expect(r2OriginHeaders(origin, origins)).toBeNull();
    }
  });
  it('permits originless Android requests for subsequent JWT and RLS checks', () => {
    expect(r2OriginHeaders(null, origins)).not.toBeNull();
  });
  it('fails closed when server origins have not been configured', () => {
    expect(r2OriginHeaders(null, ' , ')).toBeNull();
    expect(r2OriginHeaders('https://micole-web.vercel.app', '')).toBeNull();
  });
});
