# Mica · MiCole IA

Mica aparece como botón flotante **MiCole IA** en los paneles web de Superadministración, Dirección, docentes, familias, estudiantes y Secretaría académica. Atiende navegación, procedimientos y errores de MiCole. No consulta expedientes ni envía los datos del panel al proveedor; recibe el rol, el nombre interno de la pantalla y lo escrito en el chat.

El proveedor clasifica la consulta y selecciona una entrada de la guía revisada. Las respuestas de uso del sistema se construyen a partir de esa guía: se descartan respuestas libres, comandos, SQL y herramientas sugeridas por el modelo. Puede preparar texto para un comunicado, pendiente de revisión. Si falta contexto pide aclaración; los saludos, errores de escritura y fallos del proveedor no constituyen por sí mismos un motivo de pausa. Si la IA no responde, se ofrece la guía local y se identifica como tal.

Una consulta claramente ajena al sistema pausa el chat durante 30 minutos. La pausa se guarda por usuario en el servidor y se comprueba antes de consultar la IA o ejecutar una propuesta. Cambiar de sede, rol, dispositivo o conversación no la elimina. Consultar durante la pausa no prolonga el plazo. Los demás módulos siguen funcionando. La clasificación semántica depende del modelo; no es una garantía matemática de detección de cualquier formulación adversarial. Las respuestas sobre funciones se limitan además a la base de ayuda cerrada.

## Acciones disponibles

- Abrir un módulo o formulario permitido para el rol, tras pulsar **Sí, continuar**. El formulario mantiene sus pasos y permisos de guardado.
- Volver a consultar los datos del panel, tras confirmar. No asegura que un error esté resuelto ni reenvía formularios.
- Dirección puede editar un borrador de comunicado, completar los marcadores y elegir destinatarios de la sede: familias, personal o toda la comunidad. **Revisar publicación** prepara la propuesta; **Sí, publicar comunicado** ejecuta `save_announcement` con los datos mostrados. Esta primera versión publica comunicados generales de toda la sede, sin recordatorios ni confirmación de lectura. Los avisos por aula, urgentes u obligatorios se preparan desde Comunicados.

La propuesta se vincula a usuario, identidad delegada, sede y sesión de soporte. Vence a los diez minutos. El servidor vuelve a validar el acceso, la pausa y la confirmación; la ejecución es idempotente. Cancelar invalida la propuesta. La publicación conserva la auditoría y las notificaciones habituales del módulo. El asistente no cambia notas, cobros, roles ni autorizaciones de recogida; orienta hacia sus módulos existentes para su revisión.

## Configuración y verificación

La función `guide-assistant` verifica el JWT con `auth.getUser`, la vinculación al rol/sede y los límites de uso. Usa los secretos privados `GEMINI_API_KEY`, `GEMINI_MODEL` y `GEMINI_FALLBACK_MODEL`, compartidos con el análisis de documentos. Los orígenes se controlan con `APP_ORIGINS` o `DOCUMENT_IMPORT_ORIGINS`. No se incluyen claves del proveedor en la web. El límite es 30 consultas por usuario/hora y 300 por sede/día.

Migración: `node scripts/migrate-assistant.mjs` valida y revierte; `--apply` aplica. No modifica las reglas de acceso de los demás módulos. Las tablas de pausas y propuestas son privadas, sin permisos directos para clientes. Solo el servicio de Edge puede iniciar una pausa; cada usuario consulta su disponibilidad mediante la RPC autorizada.

Pruebas locales: `npm test`, `npm run build`; pruebas del handler con proveedor simulado y de permisos, pausa, cancelación, expiración, revocación e idempotencia en PGlite. Las pruebas de asistencia que dependían de que la fecha actual fuese laborable preparan ahora explícitamente el horario del aula de prueba.

Prueba remota sin publicaciones: `node scripts/verify-micole-assistant.mjs`. Usa solo las cuentas privadas del colegio persistido de pruebas; comprueba cinco roles, respuesta IA y pausa. Restaura la pausa anterior de esa cuenta QA. No imprime credenciales, publica comunicados ni envía correos.

Evidencias de esta entrega: `output/qa/2026-11-08-micole-ia/`.

La verificación pública respeta los avisos obligatorios que toman el foco. Si la cuenta familiar QA tiene un aviso pendiente, comprueba el botón presente sin saltarlo; las pruebas locales cubren la interacción familiar y móvil, y la prueba remota cubre su autorización.
