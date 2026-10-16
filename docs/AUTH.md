# Acceso de MiCole

## Estado y comprobación

La aplicación consulta los proveedores habilitados en Supabase y ofrece Google y enlace por correo cuando están activos. No utiliza Auth0. Ejecutar `npm run auth:check` comprueba los proveedores, la confirmación de correo y la redirección inicial hacia Google, sin enviar correos ni iniciar sesión. Elegir una cuenta y completar el consentimiento de Google sigue siendo una prueba interactiva.

El 15 de octubre de 2026 se comprobó en el proyecto vinculado: Google habilitado, redirección hacia Google válida, correo habilitado y confirmación obligatoria.

## Configuración de Google

1. En Google Cloud crear un cliente OAuth de tipo aplicación web y configurar la pantalla de consentimiento. Si está en pruebas, agregar las cuentas que usarán el acceso como usuarios de prueba.
2. Usar el callback de Supabase, que es distinto al callback de la aplicación: `https://<project-ref>.supabase.co/auth/v1/callback`.
3. En Supabase → Authentication → Providers → Google guardar el Client ID y Client Secret y habilitar el proveedor. El secreto queda en Supabase; nunca se coloca en `VITE_` ni en el navegador.
4. En Authentication → URL Configuration permitir `http://localhost:5173/auth/callback` y `http://localhost:5173/invite/**` durante desarrollo. Al publicar, configurar el dominio HTTPS real como Site URL y sus callbacks exactos. No compartir enlaces localhost con familias que usan otros equipos.
5. Probar `/login` con una cuenta registrada por Dirección. MiCole pide elegir una cuenta para evitar ingresar accidentalmente con un correo diferente.

Referencias oficiales: [Google en Supabase](https://supabase.com/docs/guides/auth/social-login/auth-google), [URLs de retorno](https://supabase.com/docs/guides/auth/redirect-urls), [acceso por correo](https://supabase.com/docs/guides/auth/auth-email-passwordless).

## Padres y personal

Dirección registra los nombres y correos de madre y padre. Al iniciar sesión con el correo confirmado se vinculan automáticamente todos sus hijos. Abrir una ficha de cuidados por WhatsApp no concede una cuenta ni un rol. Los docentes aceptan su invitación con el correo autorizado. Un usuario autenticado sin vinculación ve un aviso y puede consultar nuevamente su acceso; no obtiene datos escolares ni permisos por elegir un rol en el cliente.

Los padres consultan calendario, tareas, actividades, materiales, comunicados y notas de sus hijos. No publican ni editan contenido académico. Conservan los flujos familiares autorizados: cuidados, solicitud de factura, pagos, mensajes y permisos de ausencia/recogida. Las restricciones por deuda, inscripción, activación y ficha siguen vigentes.

## Estudiantes: acceso opcional

En Dirección → Estudiantes → acción **Acceso del estudiante** se habilita o revoca una cuenta por estudiante. Debe usarse un correo propio diferente al de padres/personal; un mismo correo no puede asignarse a otro alumno. No se generan ni comparten contraseñas.

Al ingresar con ese correo confirmado, el servidor deriva el rol `student`. Puede consultar tareas individuales del cuaderno, agenda y materiales, y comunicados generales o de su curso destinados a todas las personas o familias. No consulta observaciones privadas del cuaderno, notas, datos médicos, CI, contactos, pagos, documentos, permisos ni conversaciones. No puede publicar o editar.

El portal usa `student_portal()` con una respuesta explícita y mínima. No abre permisos de lectura sobre `students` ni el resto de tablas operativas. El acceso hereda el bloqueo por baja, institución inactiva, ficha incompleta, activación pendiente o deuda fuera del plazo concedido. Cuando está bloqueado solo recibe su contexto mínimo y un mensaje para contactar a su familia o Dirección; no recibe el contenido ni los importes pendientes.

La revocación o el cambio de correo se comprueban en cada consulta. El propietario puede abrir soporte como estudiante únicamente con una cuenta real habilitada y confirmada; se registra el motivo y la sesión caduca a los 30 minutos. Revocar el acceso invalida también el soporte.

Pruebas: `npm test`, `npm run test:e2e` y `npm run supabase:smoke:students`. La prueba remota usa registros temporales y termina en `ROLLBACK`.

## Android

La app nativa de MiCole está en `/Users/vincentariassaavedra/Desktop/micole-android/micole-android`, usa el mismo Supabase y los mismos permisos. El 16 de octubre de 2026 se agregó y verificó `micoleandroid://auth/callback` en los retornos permitidos, conservando las URLs web. Google y correo utilizan PKCE S256. El esquema se registra en el APK (`com.micole.android`); Expo Go no lo registra. La cuenta propietaria de plataforma sigue validándose en el servidor. La prueba de consentimiento Google completo debe hacerse con el APK instalado.
