# Marca de Google y dominio de acceso de MiCole

## Alcance elegido por el propietario

El 22/10/2026 el propietario eligió **solo nombre y logo de MiCole en Google**. No contratar Pro ni Custom Domain, no registrar o activar `auth.micole.click`, no cambiar DNS, callbacks, variables de conexión, claves ni APK como parte de esta tarea. El dominio de Supabase sigue siendo el actual. El acceso autenticado a Google Cloud sigue pendiente; no se ha aplicado todavía el cambio de marca.

## Estado comprobado el 22/10/2026

Google está habilitado en Supabase y el inicio de OAuth devuelve la autorización de Google. La marca de Google todavía no se ha modificado desde este trabajo. Supabase rechazó la consulta de dominio personalizado con `entitlement_required`: requiere el complemento Custom Domain en un plan Pro o superior. No se ha contratado ningún plan o complemento ni activado otro dominio.

El cliente OAuth activo pertenece al proyecto de Google número `902319375536`. Enlace directo a su configuración de marca: https://console.cloud.google.com/auth/branding?project=902319375536. La comprobación de autorización confirmó el callback actual y los scopes `email profile`; no se inició sesión ni se cambió el cliente.

El DNS de `micole.click` responde con los nameservers `helios.dns-parking.com` y `aster.dns-parking.com` de Hostinger. `auth.micole.click` todavía no tiene registro CNAME ni A. La compra del dominio de la web no activa el complemento de dominios de Supabase.

Coste oficial consultado el 22/10/2026: Pro desde **US$25/mes**, más Custom Domain **US$0,0137 por hora (aprox. US$10/mes)**. Base orientativa de **US$35/mes** para Pro con un proyecto Micro y un dominio; puede aumentar por otros proyectos, recursos, uso e impuestos. El dominio se factura por horas y no lo cubre el Spend Cap. El propietario descartó esta opción por ahora; esta información queda solo como referencia futura. Fuentes: https://supabase.com/pricing y https://supabase.com/docs/guides/platform/manage-your-usage/custom-domains.

La aplicación ya tiene dominio principal `https://www.micole.click`. Identidad propuesta:

- Nombre de aplicación: **MiCole**.
- Correo de soporte: **micole.click@gmail.com** (confirmar que sigue siendo el buzón administrado para soporte).
- Página principal: `https://www.micole.click`.
- Dominio autorizado: `micole.click`, verificado en Search Console por la cuenta propietaria según el registro del proyecto.
- Logo disponible: `public/brand/symbol.png`, también publicado en `https://www.micole.click/brand/symbol.png`.
- No se encontraron páginas legales públicas de privacidad y términos en el código actual. Antes de pedir la verificación deben redactarse con datos reales del responsable y publicarse con enlaces desde la landing. No presentar rutas que solo devuelvan el fallback de la app.

## Configurar la marca en Google

1. En Google Cloud, seleccionar el proyecto del **cliente OAuth que ya utiliza Supabase**, no otro cliente de un proyecto diferente. Conservar Client ID, Client Secret y permisos actuales.
2. Abrir **Google Auth Platform → Branding** y completar nombre, logo, contacto, página principal, privacidad y términos con URLs reales y accesibles.
3. Revisar **Audience** y el estado de publicación para el público previsto. Conservar solo `openid`, correo y perfil si siguen siendo los únicos datos necesarios.
4. Revisar **Verification Center**, presentar la marca y publicar los cambios cuando Google lo permita. La aprobación la determina Google; no es instantánea ni se garantiza.
5. Comprobar web y Android con una cuenta autorizada. Cambiar el nombre del proyecto Supabase o el texto del botón no sustituye esta configuración de Google.

## Opcional: `auth.micole.click`

Fuera del alcance actual. El propietario eligió no activar este dominio por ahora. Estas instrucciones quedan únicamente para una solicitud futura explícita.

1. Registrar el dominio personalizado en Supabase para obtener los valores DNS reales.
2. Añadir el CNAME `auth` apuntando a `tpzvrtapyvulghxywtwd.supabase.co` y los TXT exactos que entregue Supabase. Mantener resolución DNS directa según los requisitos del proveedor.
3. Esperar validación DNS y certificado. No inventar registros de verificación.
4. **Antes de activar el dominio**, añadir en el cliente OAuth de Google el callback `https://auth.micole.click/auth/v1/callback`, conservando `https://tpzvrtapyvulghxywtwd.supabase.co/auth/v1/callback`.
5. Mantener los retornos de la app `https://www.micole.click/auth/callback` y `micoleandroid://auth/callback` en Supabase. Son diferentes del callback del proveedor Google.
6. Activar el dominio, verificar el flujo y actualizar las URLs públicas en los entornos de web y Android que corresponda. Cambiar la URL del cliente web puede requerir iniciar sesión de nuevo; comprobar sesiones y Realtime. Las variables incorporadas en Android requieren recompilar la APK cuando se cambien.
7. No copiar secretos a `VITE_` o `EXPO_PUBLIC_`; el dominio personalizado no vuelve secreto el identificador del proyecto. El dominio original de Supabase continúa activo.

## Encargo para Work o un navegador autorizado

> En Google Cloud abre https://console.cloud.google.com/auth/branding?project=902319375536 y configura **únicamente el nombre MiCole y su logo** en la aplicación OAuth que utiliza MiCole/Supabase. El logo está en https://www.micole.click/brand/symbol.png. Conserva el cliente OAuth, sus claves, scopes, callbacks y el dominio de Supabase. No contrates Pro, Custom Domain ni otros servicios, y no cambies DNS ni configures auth.micole.click. Guarda los cambios de marca que permita la consola y comprueba su estado de publicación/verificación. Si faltan privacidad o términos públicos, informa qué falta y deja el envío a verificación pendiente; no inventes datos ni publiques textos legales. No compartas secretos en el chat. Informa qué quedó guardado y qué requiere revisión de Google.

Work puede necesitar un inicio de sesión manual en su propio navegador y puede encontrar restricciones del sitio. En este chat no hay un navegador autenticado de Google Cloud disponible; TinyFish es una integración opcional de navegador que debe conectarse antes de utilizarla. No se ha confirmado su conexión.

Referencias oficiales:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/platform/custom-domains
- https://learn.chatgpt.com/docs/browser
