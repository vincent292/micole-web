# Google y SEO de MiCole

1. Configurar `VITE_SITE_URL=https://www.micole.click` en Vercel y en la configuración local. Usar HTTPS y elegir una versión única, con o sin www. No incluir rutas ni parámetros. Una build sin dominio queda con noindex para evitar publicar direcciones incorrectas.
2. Conectar el dominio y redirigir su variante (www o sin www) al principal desde Vercel. Publicar con `npm run build`; genera `dist/robots.txt`, `dist/sitemap.xml`, metadatos sociales, canonical y datos estructurados de la marca en el HTML de la landing.
3. Conservar `vercel.json`: la landing sirve index.html; los paneles, accesos, pagos, fichas y rutas desconocidas sirven app.html con noindex desde el HTML inicial. La autenticación y RLS siguen protegiendo los datos. robots.txt no es un control de acceso.
4. Si se publica usando Build Output API con `--prebuilt`, conservar los archivos generados y usar `handle: filesystem` seguido de un fallback a `/app.html`, con cabecera `X-Robots-Tag: noindex, nofollow` en ese fallback. Los hosts *.vercel.app deben llevar noindex; la landing del dominio principal debe permitir indexación.
5. En https://search.google.com/search-console añadir la propiedad de dominio y verificar el registro TXT indicado por Google en el proveedor DNS. Este valor depende de la cuenta propietaria; no debe inventarse.
6. En Search Console → Sitemaps enviar `https://www.micole.click/sitemap.xml`. En Inspección de URLs revisar la raíz y solicitar indexación. Verificar que robots.txt y sitemap.xml respondan como archivos reales, sin devolver el HTML de React.

El sitemap incluye solo la landing pública. Las anclas de precios, funciones o solicitudes de demo no son páginas distintas. La demo y las vistas previas se generan sin indexación. No se incluyen nombres, correos, documentos, tokens, enlaces de pago ni páginas de instituciones privadas.

La aparición y los tiempos de indexación dependen de Google. Esta configuración no garantiza posiciones ni publicación inmediata en los resultados.

Si la aplicación también cambia al dominio nuevo, revisar sus redirecciones de Google/Supabase y los orígenes permitidos de R2, solicitudes de demo y pagos. Configurar SEO no cambia esos permisos automáticamente.

Referencias: https://developers.google.com/search/docs/crawling-indexing/sitemaps/build-sitemap y https://developers.google.com/search/docs/crawling-indexing/block-indexing

## Dominio confirmado: www.micole.click

Vercel tiene vinculados www.micole.click y micole.click al proyecto micole-web. El principal es https://www.micole.click y la variante sin www redirige al principal. El 20 de octubre de 2026 se confirmó que ambos dominios sirven Vercel: la variante sin www devuelve 308 hacia www y la portada canónica responde 200 con indexación permitida.

Registros recomendados por Vercel para reemplazar los de estacionamiento en Hostinger:

| Tipo | Nombre | Valor |
| --- | --- | --- |
| A | @ | 216.198.79.1 |
| A | @ | 64.29.17.1 |
| CNAME | www | 175abdf4cab80f04.vercel-dns-017.com |

Al propagar DNS, comprobar https://www.micole.click/robots.txt y https://www.micole.click/sitemap.xml, y la redirección desde https://micole.click. La configuración de referencia se obtuvo con `vercel domains verify`; si Vercel cambia sus recomendaciones, volver a consultarlas.

Search Console: verificar la propiedad micole.click con el TXT que emita Google y enviar https://www.micole.click/sitemap.xml. El 20 de octubre de 2026 se confirmó la propiedad de dominio verificada mediante DNS en la cuenta ariasvincent292@gmail.com.

## Verificación y mejoras del 20 de octubre de 2026

- Publicación comprobada: `dpl_9vxxnoYv7vZadxVFTYw4GzVbW3Vy`, en https://www.micole.click/.
- Portada renderizada durante la compilación a partir del componente Landing real. El contenido y enlaces públicos están presentes antes de ejecutar JavaScript. Las rutas privadas conservan su HTML separado sin indexación.
- Favicons ICO (16, 32 y 48 px), PNG de 96 px, Apple Touch Icon de 180 px e iconos del manifiesto de 192 y 512 px, derivados del símbolo existente.
- Portada, robots.txt, sitemap.xml e iconos: HTTP 200 y tipos correctos; variantes canónicas y exclusión del host vercel.app verificadas.
- Search Console indica que la portada ya está indexada; último rastreo registrado: 19 de octubre a las 15:58:16. Canonical declarada y seleccionada por Google: https://www.micole.click/.
- El sitemap anterior figuraba como no obtenido y el informe de la URL indicaba error temporal de procesamiento. Se reenvió el sitemap el 20 de octubre y Google confirmó su recepción; la lectura queda sujeta al procesamiento de Google.
- Solicitud de indexación enviada y confirmada: URL añadida a una cola de rastreo prioritaria.
- El último estado del sitemap sigue indicando que no se ha podido leer; no se considera resuelto en Google todavía. Se comprobó el XML público con agente Googlebot: HTTP 200, sin bloqueos y con contenido válido.
- Prueba en tiempo real de Search Console: la URL está disponible para Google y la página se puede indexar.
- Búsqueda `site:micole.click`: muestra la portada con título y descripción de MiCole.
- Validación: compilación de producción, 317 pruebas aprobadas, contenido sin JavaScript y navegación móvil sin errores.

La actualización del favicon y la posición en búsquedas dependen del nuevo rastreo y procesamiento de Google. No son inmediatos ni se garantizan posiciones.
