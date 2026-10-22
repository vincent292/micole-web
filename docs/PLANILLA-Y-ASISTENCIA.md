# Asistencia definitiva y planilla de notas

Cambios disponibles en web y en el código Android. No se generó una APK. Las nuevas funciones de la app aparecen al generar e instalar la siguiente compilación.

## Asistencia

La lista conserva los datos, las observaciones y las marcas mientras recibe cambios autorizados de Supabase Realtime. Cambios ajenos, como nuevas notificaciones, no vuelven a cargar la asistencia. Cambiar de aula, fecha, hijo o identidad cambia el contexto y evita mostrar datos del anterior.

Antes de confirmar se puede guardar un borrador. Al confirmar, la asistencia es definitiva: ningún rol puede corregir ni borrar los registros del día. La API y los triggers de base de datos lo impiden incluso si una versión antigua de la app intenta escribir. Los registros y correcciones históricos ya existentes se conservan. La contabilidad interna de entrega de notificaciones no cambia el estado de asistencia.

La confirmación avisa únicamente las faltas explícitas a madre y padre vinculados. No se interpreta como falta una casilla vacía ni un día sin lista confirmada. Las familias pueden consultar su asistencia, incluso si su acceso académico está pausado por pagos.

Los encabezados y filas son más compactos. La web conserva buscador y acciones visibles; Android usa una lista virtualizada, casillas de presencia y selección de falta, tardanza o permiso.

## Planilla

En **Evaluación y libretas → Planilla de notas** elige aula, materia y periodo. En Android, **Cambiar filtros** abre los selectores; el resto del espacio se reserva para la lista. Desliza horizontalmente para ver las columnas.

El docente puede preparar evaluaciones antes de calificar o añadirlas durante el periodo. Una columna puede ser numérica, con puntuación máxima y peso, o cualitativa. Las etiquetas iniciales son Destacado, Logrado, En proceso y Necesita apoyo. Dirección puede modificarlas desde **Reglas de notas**. Cada columna conserva su escala cuando ya tiene notas.

Las notas se guardan al salir de una casilla o pulsar Enter. Una etiqueta se guarda al elegirla. El primer registro no consume correcciones; Dirección configura cuántas modificaciones posteriores permite, entre 0 y 100, con valor inicial 3. Cada cambio posterior queda en el historial, incluidas observaciones y exenciones. Una actualización sin cambios no consume intentos. Las versiones impiden sobrescribir sin advertencia una nota modificada desde otro dispositivo.

Los cálculos se configuran por aula, materia y periodo:

- **Promedio simple:** promedio de las notas numéricas normalizadas sobre 100.
- **Promedio ponderado:** notas normalizadas sobre 100, con el peso de cada evaluación.
- **Suma de puntos:** suma de puntos obtenidos y máximo total de las columnas numéricas.

Los faltantes se muestran como pendientes; no se convierten en ceros. Las etiquetas cualitativas se presentan por separado y no se convierten silenciosamente a números. Las exenciones necesitan motivo. El periodo y la gestión deben estar abiertos para calificar.

**Periodos y libretas** conserva la configuración de gestiones y periodos, el cierre y publicación por Dirección y la reapertura con motivo. Las libretas publicadas usan el mismo cálculo y muestran las etiquetas. El promedio anual normaliza los resultados numéricos de cada periodo sobre 100.

## Tareas puntuables

Al crear o editar una tarea, activa **Puntuable: crear columna en notas al publicar**, selecciona periodo, fecha y peso, y publica la tarea. La columna y la tarea se guardan en una misma transacción. Una revisión numérica de la entrega actualiza su nota en la planilla; si el periodo está cerrado o se alcanzó el límite, la operación se rechaza completa. No se permite dejar la entrega revisada y la nota divergentes.

Las familias consultan únicamente las notas de sus hijos y no tienen controles ni API de escritura. El servidor verifica el acceso por pagos antes de entregar la planilla; una ruta o una versión antigua del cliente no evita ese control. Se conservan las excepciones de soporte del propietario ya autorizadas.

## Despliegue y verificación

```sh
node scripts/migrate-gradebook-sheet.mjs          # Validación con rollback
node scripts/migrate-gradebook-sheet.mjs --apply
npm test
npm run build
```

Migraciones: `202610220003_final_student_attendance.sql` y `202610220004_gradebook_sheet.sql`. Las pruebas cubren bloqueo definitivo de asistencia, permisos, límites y registro de cambios, versiones concurrentes, cálculos, etiquetas, integración de tareas y bloqueo familiar por pagos. La interfaz se comprueba además en navegador y Expo Web; esto no sustituye la comprobación del APK instalado.
