# Asistencia y boletas del equipo

Dirección administra cada sede desde computadora o Android. Cada docente consulta únicamente sus registros y sus boletas aprobadas; familias y estudiantes no acceden al módulo.

## Preparación

1. El control de llegada es **opcional por sede**, tanto para colegios como para kínder y guarderías. En **Asistencia del equipo → Configurar ubicación y reglas**, define latitud, longitud, rango permitido y precisión máxima GPS, y marca **Activar control de llegada en esta sede** cuando quieras usarlo. Una sede nueva comienza desactivada; las sedes que ya tenían configuración conservan la activación. «Usar mi ubicación» sirve estando físicamente en la sede; no necesita una clave de Google Maps.
2. Define tolerancia y valor por minuto. Con 10 minutos de tolerancia y 15 de atraso, «Solo minutos adicionales» calcula 5 minutos; «Toda la tardanza» calcula 15. Tolerancia cero permite contar todo el atraso. Los descuentos están desactivados hasta que Dirección los habilita e indica su respaldo en el reglamento o acuerdo aplicable.
3. Configura a cada docente: sueldo mensual o por horas, días, uno o más turnos por día, entrada, salida y descanso no remunerado. Los turnos no se superponen ni cruzan medianoche.

Las fracciones de minuto de atraso se redondean al minuto siguiente. Las condiciones de tardanza quedan guardadas con cada marcación. Cambiar las reglas no recalcula registros anteriores.

## Marcación y corrección

En Android, el docente pulsa primero **Verificar mi ubicación**. Entrada y salida se habilitan solo con una lectura precisa, dentro del radio y de menos de 90 segundos. Al pulsar **Marcar entrada** o **Marcar salida**, la app obtiene una nueva lectura para evitar usar una ubicación previa. En la web se solicita ubicación al marcar. Supabase verifica el docente, la sede, el rango, la precisión, la antigüedad de la lectura y el indicador de ubicación simulada; guarda su propia hora de servidor. No depende de la hora elegida por el teléfono. No hay seguimiento GPS en segundo plano ni marcaciones sin conexión.

Una coordenada reportada por un dispositivo no constituye una prueba infalible de presencia. Para un control adicional puede incorporarse un QR rotativo presencial o un reloj de asistencia; estos métodos adicionales no forman parte de esta versión.

Una entrada pendiente debe cerrarse antes de abrir otra. Las entradas de más de 24 horas requieren corrección de Dirección. Ante GPS impreciso, falta de permisos u olvido, Dirección registra o corrige la asistencia con un motivo obligatorio. Las correcciones conservan el registro previo y se auditan. Puede justificar una tardanza para excluir su descuento.

Desactivar el control impide nuevas marcaciones GPS de entrada y salida, incluso desde una APK anterior o una llamada directa al servidor. Conserva las coordenadas, los horarios, el historial y las boletas; las entradas que queden abiertas deben cerrarse mediante una corrección justificada de Dirección. El cálculo y la consulta de boletas no exigen activar el control GPS.

Si hay varios turnos en el día, se descartan primero los que están fuera de la ventana permitida (desde dos horas antes del inicio hasta la salida programada). Se prioriza un turno que ya comenzó frente a uno futuro; solo se consideran turnos pendientes. Así un turno posterior no bloquea una llegada al turno vigente.

## Boletas

- En **Boletas de pago**, selecciona mes y docente y prepara un borrador.
- Mensual: usa el sueldo base configurado, sin deducciones automáticas por ausencias. Por horas: suma minutos de turnos con salida y resta el descanso programado; aplica el valor por hora guardado con cada marcación. Cambiar una tarifa no altera horas ya registradas.
- Revisa la tardanza propuesta y agrega aportes, impuestos, bonos, anticipos, prorrateos u otros conceptos que correspondan. El sistema no determina por sí mismo la legalidad de una sanción ni calcula obligaciones laborales, tributarias, beneficios sociales o recargos de horas extra.
- La aprobación exige terminar el mes, cerrar las marcaciones y revisar una fuente vigente. Si se cambió la asistencia o el sueldo, recalcula y revisa de nuevo. Recalcular reemplaza conceptos manuales del borrador.
- Una boleta aprobada conserva sus importes y bloquea cambios de asistencia en ese período. Los ajustes posteriores se documentan en otra boleta.
- El docente puede consultar e imprimir/guardar su boleta. El estado distingue borrador, aprobada y pago registrado; aprobar no equivale a pagar.
- Dirección puede registrar un pago ya efectuado por efectivo, transferencia o depósito, con referencia. MiCole no ejecuta transferencias al personal.

## Publicación y Android

En una instalación nueva, aplicar primero `npm run supabase:migrate:staff`. Para añadir el interruptor y la corrección de turnos: `node scripts/migrate-staff-arrival.mjs` valida y revierte; `node scripts/migrate-staff-arrival.mjs --apply` aplica la migración 202610240005. Después publicar la web y actualizar Android. La demo usa registros simulados en el navegador, sin consultas GPS, Supabase ni pagos reales; «Restablecer demo» elimina estos ejemplos.

Android usa el mismo backend. Se incorporó `expo-location` compatible con SDK 57 con permisos solo durante el uso. Los cambios de permisos y la dependencia nativa requieren generar e instalar una APK nueva; no están presentes automáticamente en una APK anterior. No se genera ninguna APK como parte de este cambio.

Verificación: pruebas de RLS, rango y precisión, simulación, reloj de servidor, idempotencia, sueldos mensuales/por hora, tolerancias, correcciones, estados inmutables y demo; además tipos y lint de Android. La precisión y permisos en los teléfonos reales se deben comprobar en un piloto en cada sede.

Referencias: [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [ubicación y geofencing de Android](https://developer.android.com/develop/sensors-and-location/location/geofencing).
