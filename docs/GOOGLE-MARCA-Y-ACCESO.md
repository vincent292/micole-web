# Marca de Google y dominio de acceso de MiCole

## Estado comprobado el 22/10/2026

Google está habilitado en Supabase y el inicio de OAuth devuelve la autorización de Google. La marca de Google todavía no se ha modificado desde este trabajo. Supabase rechazó la consulta de dominio personalizado con `entitlement_required`: requiere el complemento Custom Domain en un plan Pro o superior. No se ha contratado ningún plan o complemento ni activado otro dominio.

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

Solo continuar después de que el propietario elija el plan y complemento de pago y apruebe su coste.

1. Registrar el dominio personalizado en Supabase para obtener los valores DNS reales.
2. Añadir el CNAME `auth` apuntando a `tpzvrtapyvulghxywtwd.supabase.co` y los TXT exactos que entregue Supabase. Mantener resolución DNS directa según los requisitos del proveedor.
3. Esperar validación DNS y certificado. No inventar registros de verificación.
4. **Antes de activar el dominio**, añadir en el cliente OAuth de Google el callback `https://auth.micole.click/auth/v1/callback`, conservando `https://tpzvrtapyvulghxywtwd.supabase.co/auth/v1/callback`.
5. Mantener los retornos de la app `https://www.micole.click/auth/callback` y `micoleandroid://auth/callback` en Supabase. Son diferentes del callback del proveedor Google.
6. Activar el dominio, verificar el flujo y actualizar las URLs públicas en los entornos de web y Android que corresponda. Cambiar la URL del cliente web puede requerir iniciar sesión de nuevo; comprobar sesiones y Realtime. Las variables incorporadas en Android requieren recompilar la APK cuando se cambien.
7. No copiar secretos a `VITE_` o `EXPO_PUBLIC_`; el dominio personalizado no vuelve secreto el identificador del proyecto. El dominio original de Supabase continúa activo.

## Encargo para Work o un navegador autorizado

> En el proyecto de Google Cloud cuyo cliente OAuth utiliza MiCole/Supabase, configura la marca de acceso **MiCole**, su logo y la página `https://www.micole.click`. Comprueba el correo de soporte `micole.click@gmail.com` y la propiedad `micole.click`. Revisa qué URLs de privacidad y términos faltan; no inventes textos legales ni envíes la verificación con páginas inexistentes. Conserva Client ID, Client Secret, callbacks existentes y scopes. Presenta los cambios de marca listos y completa la verificación que permita Google. Para `auth.micole.click`, prepara las opciones y coste del plan Pro y Custom Domain antes de contratar o activar algo; el callback nuevo debe añadirse en Google antes de activar el dominio. No compartas secretos en el chat. Distingue lo realizado de lo pendiente.

Work puede necesitar un inicio de sesión manual en su propio navegador y puede encontrar restricciones del sitio. En este chat no hay un navegador autenticado de Google Cloud disponible; TinyFish es una integración opcional de navegador que debe conectarse antes de utilizarla. No se ha confirmado su conexión.

Referencias oficiales:

- https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification
- https://supabase.com/docs/guides/auth/social-login/auth-google
- https://supabase.com/docs/guides/platform/custom-domains
- https://learn.chatgpt.com/docs/browser
