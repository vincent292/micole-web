# Asistencia y boletas del equipo

Dirección administra cada sede desde computadora o Android. Cada docente consulta únicamente sus registros y sus boletas aprobadas; familias y estudiantes no acceden al módulo.

## Preparación

1. En **Asistencia del equipo → Configurar ubicación y reglas**, define latitud, longitud, rango permitido y precisión máxima GPS. «Usar mi ubicación» sirve estando físicamente en la sede; no necesita una clave de Google Maps.
2. Define tolerancia y valor por minuto. Con 10 minutos de tolerancia y 15 de atraso, «Solo minutos adicionales» calcula 5 minutos; «Toda la tardanza» calcula 15. Tolerancia cero permite contar todo el atraso. Los descuentos están desactivados hasta que Dirección los habilita e indica su respaldo en el reglamento o acuerdo aplicable.
3. Configura a cada docente: sueldo mensual o por horas, días, uno o más turnos por día, entrada, salida y descanso no remunerado. Los turnos no se superponen ni cruzan medianoche.

Las fracciones de minuto de atraso se redondean al minuto siguiente. Las condiciones de tardanza quedan guardadas con cada marcación. Cambiar las reglas no recalcula registros anteriores.

## Marcación y corrección

En Android, el docente pulsa primero **Verificar mi ubicación**. Entrada y salida se habilitan solo con una lectura precisa, dentro del radio y de menos de 90 segundos. Al pulsar **Marcar entrada** o **Marcar salida**, la app obtiene una nueva lectura para evitar usar una ubicación previa. En la web se solicita ubicación al marcar. Supabase verifica el docente, la sede, el rango, la precisión, la antigüedad de la lectura y el indicador de ubicación simulada; guarda su propia hora de servidor. No depende de la hora elegida por el teléfono. No hay seguimiento GPS en segundo plano ni marcaciones sin conexión.

Una coordenada reportada por un dispositivo no constituye una prueba infalible de presencia. Para un control adicional puede incorporarse un QR rotativo presencial o un reloj de asistencia; estos métodos adicionales no forman parte de esta versión.

Una entrada pendiente debe cerrarse antes de abrir otra. Las entradas de más de 24 horas requieren corrección de Dirección. Ante GPS impreciso, falta de permisos u olvido, Dirección registra o corrige la asistencia con un motivo obligatorio. Las correcciones conservan el registro previo y se auditan. Puede justificar una tardanza para excluir su descuento.

## Boletas

- En **Boletas de pago**, selecciona mes y docente y prepara un borrador.
- Mensual: usa el sueldo base configurado, sin deducciones automáticas por ausencias. Por horas: suma minutos de turnos con salida y resta el descanso programado; aplica el valor por hora guardado con cada marcación. Cambiar una tarifa no altera horas ya registradas.
- Revisa la tardanza propuesta y agrega aportes, impuestos, bonos, anticipos, prorrateos u otros conceptos que correspondan. El sistema no determina por sí mismo la legalidad de una sanción ni calcula obligaciones laborales, tributarias, beneficios sociales o recargos de horas extra.
- La aprobación exige terminar el mes, cerrar las marcaciones y revisar una fuente vigente. Si se cambió la asistencia o el sueldo, recalcula y revisa de nuevo. Recalcular reemplaza conceptos manuales del borrador.
- Una boleta aprobada conserva sus importes y bloquea cambios de asistencia en ese período. Los ajustes posteriores se documentan en otra boleta.
- El docente puede consultar e imprimir/guardar su boleta. El estado distingue borrador, aprobada y pago registrado; aprobar no equivale a pagar.
- Dirección puede registrar un pago ya efectuado por efectivo, transferencia o depósito, con referencia. MiCole no ejecuta transferencias al personal.

## Publicación y Android

Aplicar `npm run supabase:migrate:staff`, publicar la web y desplegar `guide-assistant` para incluir las nuevas instrucciones. La demo usa registros simulados en el navegador, sin consultas GPS, Supabase ni pagos reales; «Restablecer demo» elimina estos ejemplos.

Android usa el mismo backend. Se incorporó `expo-location` compatible con SDK 57 con permisos solo durante el uso. Los cambios de permisos y la dependencia nativa requieren generar e instalar una APK nueva; no están presentes automáticamente en una APK anterior. No se genera ninguna APK como parte de este cambio.

Verificación: pruebas de RLS, rango y precisión, simulación, reloj de servidor, idempotencia, sueldos mensuales/por hora, tolerancias, correcciones, estados inmutables y demo; además tipos y lint de Android. La precisión y permisos en los teléfonos reales se deben comprobar en un piloto en cada sede.

Referencias: [Expo Location SDK 57](https://docs.expo.dev/versions/v57.0.0/sdk/location/), [ubicación y geofencing de Android](https://developer.android.com/develop/sensors-and-location/location/geofencing).
