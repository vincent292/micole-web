# Formularios, emergencias y calendario con Gemini

Dirección tiene un nuevo apartado **Formularios y calendario** en web y Android. No requiere generar una APK para integrar el código; la APK anterior necesitará actualizarse cuando se compile manualmente.

## Inscripción y emergencias

La ficha compartida por WhatsApp y la opción **Completar cuidados** incluyen domicilio, lugar de nacimiento, profesión/trabajo/CI de los padres, responsable de pagos, convivencia, antecedentes de salud, lentes/audición, tratamientos, centro médico, parentesco de los contactos y hasta cinco autorizados para el recojo. Los autorizados no obtienen acceso a MiCole; una recogida concreta mantiene su solicitud y verificación del carnet.

La decisión para emergencias se elige explícitamente y registra nombre/CI. Es una declaración informativa; no reemplaza una firma ni permite que la IA autorice tratamientos. No se cambian reglas de cobro a partir de las condiciones de un documento.

En **Estudiantes → Emergencias**, Dirección y el docente autorizado consultan la ficha y pueden llamar a los contactos. Los padres completan la ficha de sus hijos. El estudiante no recibe estos datos en su portal.

## Documentos de cada institución

1. Elegir gestión y tipo: formulario o calendario. Para calendario, elegir aula de esa gestión o toda la institución.
2. Seleccionar hasta tres PDF/fotos (PDF, JPG, PNG, WebP, HEIC o HEIF), hasta 5 MB cada uno y 10 MB entre todos.
3. Confirmar que son plantillas vacías/calendarios sin datos personales y pulsar **Leer con Gemini**.
4. Comparar el original con las preguntas o actividades. Corregir etiquetas, tipos, opciones, fechas y rangos; desmarcar lo que no corresponda.
5. Confirmar la revisión y publicar. No se publican resultados de la IA automáticamente.

Las preguntas básicas ya existen. La IA propone solo preguntas adicionales y condiciones informativas. Se pueden añadir preguntas manualmente. Publicar una plantilla actualiza esa gestión; si otro director la editó mientras se revisaba, se exige recargar para evitar sobrescribirla.

Los enlaces familiares guardan una copia de la plantilla que recibieron. Cambiar una plantilla no altera los enlaces existentes ni la revisión pendiente. Las respuestas quedan en la ficha del estudiante al aprobarlas. No se devuelven respuestas médicas por el enlace público.

Las actividades confirmadas se guardan en la agenda real y respetan sus permisos y bloqueos. Los rangos aparecen en cada día del intervalo. Fechas inexistentes, de otro año o fuera de orden no se aceptan. La importación es una transacción: un error no deja eventos a medias. Reintentar una confirmación no duplica sus eventos; las coincidencias de título, fechas y aula se omiten.

## Configuración del servidor

En el `.env` privado de la web:

```
GEMINI_API_KEY=...
GEMINI_MODEL=gemini-3.6-flash
GEMINI_FALLBACK_MODEL=gemini-3.1-flash-lite
```

No agregar la clave a `VITE_*`, `EXPO_PUBLIC_*` ni a la app Android. Android usa la misma Edge Function autenticada.

```
npm run supabase:migrate:documents
npm run supabase:setup:documents
```

El segundo comando requiere `supabase` en PATH y sesión iniciada. También admite `MICOLE_SUPABASE_CLI` con la ruta al ejecutable. Guarda los secretos remotos mediante un archivo temporal privado y lo elimina al terminar. `DOCUMENT_IMPORT_ORIGINS` permite configurar dominios adicionales sin modificar la configuración de R2.

La función verifica el JWT, la institución y el rol Dirección —incluido soporte delegado por el propietario— antes de llamar a Gemini. Se limita a 30 lecturas por usuario y 100 por institución en 24 horas. La clave no se envía al navegador, no se aceptan URLs remotas ni se ejecutan instrucciones del documento.

Los originales permanecen en el dispositivo durante la revisión y se envían a Gemini únicamente al pulsar Leer; no se publican en R2 ni se guardan en Supabase. Se guardan preguntas/condiciones aprobadas o eventos confirmados. El historial de importación no contiene el archivo. Nunca cargar fichas llenas con nombres, CI o antecedentes de menores. Para otro uso con datos personales debe revisarse la configuración y tratamiento de datos del proveedor.

Referencias: [imágenes](https://ai.google.dev/gemini-api/docs/image-understanding), [PDF](https://ai.google.dev/gemini-api/docs/document-processing), [JSON estructurado](https://ai.google.dev/gemini-api/docs/structured-output), [tratamiento de datos](https://ai.google.dev/gemini-api/terms).

Si el principal devuelve 503/504 o no responde, se intenta una vez con el respaldo configurado. El tiempo total se limita a 85 segundos. Los errores de credenciales o cuota se muestran directamente. Las dos fotos de referencia fueron interpretadas con `gemini-3.1-flash-lite`; Dirección debe revisar las advertencias y el contenido antes de publicarlo.
