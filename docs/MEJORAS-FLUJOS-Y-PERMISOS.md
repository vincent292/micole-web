# Mejoras de recorridos, privacidad y revisión — 24 de octubre de 2026

Alcance autorizado: recomendaciones 1, 3, 4, 5, 6 y 7. No se incorpora la separación de funciones de cobro/descuento/anulación/configuración bancaria propuesta en el punto 2.

## Uso

- **Asistencia:** confirmar protege la lista original. En «Correcciones de asistencia», un docente o Dirección solicita el estado/observación propuestos y un motivo interno. Dirección de la sede aprueba o rechaza con motivo. Solo la aprobación afecta a la proyección de historial, CSV y asistencia familiar; nunca reescribe el registro original. La familia recibe aviso y ve la corrección aprobada, sin motivos internos. Las solicitudes y decisiones avisan al personal correspondiente y se actualizan por Realtime.
- **Privacidad docente:** conserva alergias, alimentos restringidos, condiciones/indicaciones de cuidado, seguro/proveedor y contactos operativos de sus alumnos. El directorio elimina CI, RUDE, correos familiares, número de seguro y respuestas adicionales de inscripción para quien no sea Dirección o familia verificada del alumno. La restricción de columnas del servidor se activa en una fase posterior para no romper aplicaciones Android antiguas.
- **Aula:** «Tu jornada» reúne asistencia, alumnos/emergencias, calendario, materias y entregas por revisar; los enlaces mantienen aula/materia. Las materias propias permiten el trabajo existente; la tutoría consulta otras sin recibir permisos de edición. Guardería/kínder conserva cuidados, cuaderno digital y seguimiento del grupo. Dirección mantiene el expediente con inscripción, documentos y cuenta del alumno.
- **Lectura y autorización:** los comunicados usan «He leído»/«Confirmar lectura», con apertura y confirmación diferenciadas. Las actividades usan «Autorizo»/«No autorizo», última respuesta, autor/fecha y CSV; participación automática o pago no cuentan como consentimiento. Una respuesta puede registrarse incluso si la actividad ya fue pagada y no modifica cobros ni participación administrativa. Las respuestas anteriores quedan en un registro de eventos protegido contra escritura de clientes.
- **Conexión y borradores:** asistencia conserva borradores en memoria por usuario/rol/sede/aula/fecha; salir y volver dentro de la sesión no los pierde. No es almacenamiento persistente entre reinicios. «Guardar borrador» envía al servidor sin avisar faltas; «Confirmar» sí notifica. El envío usa una solicitud idempotente: un reintento con el mismo contenido/revisión devuelve el resultado anterior sin duplicar lista ni avisos. No hay cola que confirme asistencia automáticamente sin intervención.
- **Gemini:** puede orientar y preparar un borrador textual. El servidor normaliza campos, descarta instrucciones ejecutables y limita los destinos a navegación conocida. Los clientes muestran revisión humana y no publican, cobran, cambian notas/permisos ni autorizan recogidas desde una respuesta del modelo. Los permisos y límites por sede siguen comprobados en servidor.

## Despliegue por fases

1. Comprobar la migración de seguridad pendiente `202610230003_security_audit.sql` y aplicar las aditivas `202610240001_attendance_corrections.sql`, `202610240002_activity_authorization.sql` y `202610240003_student_directory.sql`.
2. `node scripts/migrate-workflows.mjs` valida el conjunto en transacción y revierte; `--apply` confirma. La restricción de columnas 240004 no se incluye por defecto.
3. Desplegar web, demo y funciones nuevas (`guide-assistant`; también `bank-qr` y `r2-media` de la auditoría anterior). Conservar configuraciones de JWT de cada función y acceso privado de la demo. Verificar las versiones nuevas antes de retirar compatibilidad antigua.
4. Compilar/distribuir Android actualizado manualmente. No se genera APK como parte de esta tarea. Android anterior usa `students.select('*')` y dejaría de cargar al retirar el permiso global de selección.
5. Después de actualizar los clientes, ejecutar el mismo script con `--apply --enforce-privacy` para aplicar `202610240004_student_privacy.sql`. Esta fase impide que un docente eluda la proyección RPC consultando columnas privadas directamente. Previamente el cliente nuevo ya recibe la proyección reducida, pero no debe afirmarse que existe bloqueo completo de la API antigua.
6. Probar en producción con una institución de pruebas y cuentas de cada rol: solicitud/aprobación/rechazo, respuesta de autorización después de un pago, directorio privado y reintento de envío. Ninguna migración realiza un cobro ni corrige asistencia automáticamente.

Las pruebas locales verifican contratos, permisos SQL y recorridos ficticios; el comportamiento visual nativo requiere comprobación con el nuevo binario. La demo conserva todos los cambios únicamente en el navegador.

## Verificación y activación de esta revisión

- 451 pruebas web/SQL aprobadas, además de recorridos de aula/expediente y corrección/autorización en navegador. Android: 90 pruebas verificadas, TypeScript y lint sin errores.
- Migraciones 240001, 240002 y 240003 validadas contra el esquema vinculado y aplicadas; la de seguridad 230003 ya figuraba aplicada.
- 240004 validada en transacción revertida y pendiente hasta actualizar los clientes Android.
- No se generó APK ni se ejecutaron cobros, correcciones o autorizaciones sobre alumnos reales como prueba.
