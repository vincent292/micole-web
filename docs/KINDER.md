# Jornada para kínderes y guarderías

El modo kínder da prioridad a cuidados, asistencia, cuaderno, aprendizajes y familias. Es una preferencia de presentación: conserva los roles, los permisos y los enlaces de los demás módulos.

## Activación

Dirección abre **Configuración → Editar identidad → Niveles de esta sede → Modo de trabajo**:

- **Automático según los niveles**: usa el modo kínder cuando todos los niveles declarados son de educación infantil. Una sede mixta conserva la navegación de colegio; sus aulas infantiles sí presentan la jornada adaptada.
- **Kínder y guardería**: prioriza la jornada infantil de la sede.
- **Colegio**: conserva la navegación de colegio.

Las herramientas secundarias permanecen en **Más opciones** y **Más opciones del aula**. Superadministración mantiene su navegación. Los requisitos de inscripción, cobro y permisos no cambian con este selector.

## Registrar un cuidado para el grupo

1. Dirección o el docente asignado abre **Así fue su día → Registrar para el aula**. También puede entrar desde la jornada del aula.
2. Elige aula, fecha hasta hoy, tipo de cuidado y hora. Los tipos disponibles son alimentación, descanso, higiene y estado de ánimo.
3. Completa los datos comunes y selecciona a los niños que recibieron ese cuidado. Solo aparecen inscripciones activas del aula autorizada. La selección inicia vacía y no modifica la lista de asistencia.
4. Pulsa **Revisar registros**. Puede ajustar por niño la cantidad consumida, el fin del descanso, la higiene o el ánimo, además de su observación. Las observaciones individuales llegan únicamente al resumen de ese niño.
5. Pulsa **Guardar cuidados**. Todos los registros se guardan juntos; si uno es inválido, no se conserva ninguno.

Los incidentes mantienen el registro individual. El registro individual anterior también permite corregir los cuidados guardados.

## Reintentos y consulta familiar

Ante una respuesta de red perdida, se conserva el mismo pedido para reintentar sin duplicarlo. Cerrar y reabrir el formulario durante la misma sesión recupera ese pedido; sus campos quedan bloqueados hasta comprobar el resultado. Los rechazos definitivos del servidor permiten volver y corregir la selección.

El pedido pendiente se conserva solo en memoria y se elimina al cerrar sesión. No es una cola de trabajo sin conexión y no sobrevive a recargar la aplicación.

La familia consulta el resumen diario existente de su hijo, con alimentación, descanso, higiene, ánimo y observaciones. No puede registrar cuidados para el grupo ni consultar los de otras familias.

## Instalación y comprobación

- Migración: `202610260003_kinder_daily_workflow.sql`.
- Comprobar la migración sin guardar: `node scripts/migrate-kinder.mjs`.
- Aplicar al proyecto vinculado: `npm run supabase:migrate:kinder`.
- Comprobar modo, guardado y reintento contra Supabase con datos temporales y rollback: `npm run supabase:smoke:kinder`.
- Pruebas: `npm test` y `npx playwright test tests/kinder-daily-workflow.e2e.spec.ts`.

El servidor valida el aula, la sede, el docente, el estado de inscripción y los permisos de soporte. El registro de un pedido no almacena otra copia de los cuidados: conserva una huella para reconocer sus reintentos.
