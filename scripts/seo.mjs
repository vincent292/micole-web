import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { createServer, loadEnv } from 'vite';

export function siteOrigin(value) {
  if (!value) return '';
  const url = new URL(value);
  if (url.protocol !== 'https:' || url.username || url.password || url.port || url.search || url.hash || url.pathname !== '/' || !url.hostname.includes('.') || /(^localhost$|\.(test|invalid)$)/.test(url.hostname))
    throw new Error('VITE_SITE_URL debe ser el dominio público HTTPS, sin rutas ni parámetros.');
  return url.origin;
}
const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function seoFiles(html, meta, { siteUrl = '', demo = false, preview = false, landingHtml = '' } = {}) {
  const origin = siteOrigin(siteUrl), indexable = !!origin && !demo && !preview;
  const clean = html.replace(/<title>[^<]*<\/title>/g, '').replace(/<meta\s+name=["'](?:description|robots)["'][^>]*>/g, '');
  const privateHead = `<title>${demo?'Demo MiCole · Explora tu comunidad':'MiCole · Espacio privado'}</title>\n<meta name="robots" content="noindex, nofollow" />`;
  const graph = origin ? {
    '@context':'https://schema.org', '@graph':[
      {'@type':'Organization','@id':`${origin}/#organization`,name:meta.name,url:`${origin}/`,logo:`${origin}${meta.image}`},
      {'@type':'WebSite','@id':`${origin}/#website`,name:meta.name,url:`${origin}/`,inLanguage:'es-BO',publisher:{'@id':`${origin}/#organization`}}
    ]
  } : null;
  const publicHead = `<title>${escape(meta.title)}</title>
<meta name="description" content="${escape(meta.description)}" />
<meta name="robots" content="index, follow, max-image-preview:large" />
<link rel="canonical" href="${escape(origin)}/" />
<meta property="og:type" content="website" />
<meta property="og:site_name" content="MiCole" />
<meta property="og:locale" content="es_BO" />
<meta property="og:title" content="${escape(meta.title)}" />
<meta property="og:description" content="${escape(meta.description)}" />
<meta property="og:url" content="${escape(origin)}/" />
<meta property="og:image" content="${escape(origin+meta.image)}" />
<meta property="og:image:alt" content="MiCole, gestión para colegios y guarderías" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${escape(meta.title)}" />
<meta name="twitter:description" content="${escape(meta.description)}" />
<meta name="twitter:image" content="${escape(origin+meta.image)}" />
<script id="micole-search-schema" type="application/ld+json">${JSON.stringify(graph).replace(/</g,'\\u003c')}</script>`;
  return {
    index: clean.replace('</head>', `${indexable?publicHead:privateHead}\n</head>`).replace('<div id="root"></div>', `<div id="root">${indexable ? landingHtml : ''}</div>`),
    app: clean.replace('</head>', `${privateHead}\n</head>`),
    robots: indexable ? `User-agent: *\nAllow: /\n\n# Las rutas privadas responden con noindex y mantienen su autenticación.\nSitemap: ${origin}/sitemap.xml\n` : 'User-agent: *\nDisallow: /\n',
    sitemap: `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${indexable?`\n  <url><loc>${escape(origin)}/</loc></url>\n`:''}</urlset>\n`,
    indexable
  };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const env = {...loadEnv('production', process.cwd(), ''), ...process.env};
  const directory = path.resolve('dist');
  const meta = JSON.parse(fs.readFileSync('src/lib/site-meta.json','utf8'));
  const options = {
    siteUrl: env.VITE_SITE_URL,
    demo: env.VITE_PUBLIC_DEMO === 'true' || env.VITE_APP_MODE !== 'live',
    preview: !!env.VERCEL_ENV && env.VERCEL_ENV !== 'production'
  };
  // Make the public content available even before Google executes JavaScript.
  // Demos, previews and private route HTML never contain this public render.
  if (siteOrigin(options.siteUrl) && !options.demo && !options.preview) {
    const server = await createServer({ server: { middlewareMode: true }, appType: 'custom', mode: 'production' });
    try {
      const { renderLanding } = await server.ssrLoadModule('/src/seo-render.tsx');
      options.landingHtml = renderLanding();
    } finally {
      await server.close();
    }
  }
  const files = seoFiles(fs.readFileSync(path.join(directory,'index.html'),'utf8'), meta, options);
  for (const [name,value] of [['index.html',files.index],['app.html',files.app],['robots.txt',files.robots],['sitemap.xml',files.sitemap]]) fs.writeFileSync(path.join(directory,name), value);
  console.log(files.indexable ? 'SEO: landing pública, sitemap y rutas privadas sin indexación.' : 'SEO: esta build queda fuera del índice (demo, preview o dominio sin configurar).');
}
