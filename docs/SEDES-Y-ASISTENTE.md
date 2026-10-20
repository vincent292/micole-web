# Sedes y asistente de Dirección

Una institución puede tener sede principal y sucursales con niveles distintos. Cada sede conserva un `school_id` propio: las políticas existentes aíslan estudiantes, cursos, calendarios, formularios, archivos, pagos, banco y facturación. `institution_id` agrupa las sucursales sin ampliar los permisos de una directora exclusiva.

La Dirección principal administra sedes e invita responsables. Sus accesos se heredan y se sincronizan al revocar la membresía principal. Una directora de sucursal solo administra su sede. La sesión de pruebas del propietario permite cambiar únicamente entre sedes marcadas de la misma institución y registra ese cambio.

El crédito inicial y la facturación de MiCole son independientes por sede, según la decisión comercial. No se copian credenciales bancarias. La nueva sede requiere su propio adelanto. Los calendarios importados reciben únicamente el identificador de la sede seleccionada y la gestión elegida; el servidor comprueba el rol y la pertenencia del aula.

## Interfaz

- Formulario de inscripción: módulo de administración independiente por sede y gestión.
- Agenda → Importar calendario: revisión y publicación de actividades de esa sede.
- Sedes y sucursales: niveles educativos, responsables, invitaciones y cambio de sede.
- Las modales validan cada paso antes de avanzar. Guardar aparece al final y se vuelven a validar todos los campos.
- El cuerpo de la modal permite scroll; su pie permanece visible. Los campos conservan sus valores al regresar a un paso.

## Asistente

La función `guide-assistant` utiliza el secreto existente `GEMINI_API_KEY` y la configuración `GEMINI_MODEL`/`GEMINI_FALLBACK_MODEL`. Conserva `verify_jwt = true`, valida adicionalmente `auth.getUser()` y reserva cada consulta mediante una RPC que exige Dirección en la sede correspondiente. Límite: 30 consultas por hora por cuenta y 300 al día por sede.

No consulta expedientes, notas, datos bancarios ni archivos. No guarda conversaciones en Supabase. Envía solo la conversación de ayuda que escribe el usuario y una guía de capacidades verificadas. La respuesta estructurada admite acciones de una lista cerrada; solo abren páginas o formularios existentes. No ejecuta escrituras ni confirma pagos. La persona revisa y guarda mediante el flujo habitual. En la demo se utiliza una guía local sin llamadas a Gemini.

Publicación: aplicar `npm run supabase:migrate:sites`, desplegar `guide-assistant` y publicar web/demo. Android usa el mismo backend; los cambios de código no generan un APK.

Referencias: [JWT y cabeceras en Edge Functions](https://supabase.com/docs/guides/functions/auth-headers), [respuestas estructuradas de Gemini](https://ai.google.dev/gemini-api/docs/generate-content/structured-output).
