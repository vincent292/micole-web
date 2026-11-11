"""Contenido operativo del manual. Las capturas se reutilizan sin modificar."""
VERSION = '1.2'
DATE = '29 de octubre de 2026'
PAGES = []
QA = 'output/qa/'
OLD = QA + '2026-10-27-apk-web/'
FULL = QA + '2026-10-27-completa/'
NEW = QA + '2026-10-28-avisos/'
ATT = QA + '2026-10-29-asistencia/'
IMP = QA + '2026-10-29-avisos-importantes/'

def page(key, chapter, title, route='', lead='', steps=(), result='', note='', photo=None, caption='', kind='workflow', flow=()):
    PAGES.append(dict(key=key,chapter=chapter,title=title,route=route,lead=lead,steps=list(steps),result=result,note=note,photo=photo,caption=caption,kind=kind,flow=list(flow)))

page('portada','MiCole','Manual completo de uso',kind='cover')
page('indice','Cómo usar esta guía','Encuentra tu recorrido',kind='contents')
page('acceso','Primeros pasos','Entrar con tu propia cuenta','www.micole.click > Ingresar | APK > Acceso',
 'Usa el correo que la institución tiene vinculado a tu función. El rol lo determina tu cuenta.',[
 'Abre el sitio oficial o la APK actualizada. En el acceso, elige Con contraseña, Recibir enlace o Continuar con Google, según las opciones disponibles.',
 'Con contraseña: escribe tu correo y contraseña y pulsa Ingresar con contraseña. No uses el correo de otra persona para representar tu rol.',
 'Con enlace: solicita el acceso, revisa correo y spam y abre el enlace personal en el dispositivo donde continuarás. Si venció, pide uno nuevo.',
 'Con Google: elige la cuenta exacta registrada. Completa el consentimiento y vuelve a MiCole. Una cuenta Google distinta no hereda el acceso.',
 'Si aparece acceso por vincular, verifica el correo y pide a Dirección que revise tu invitación, vínculo familiar o cuenta de estudiante. Después usa Verificar acceso.'
 ],'Debe aparecer tu nombre, tu institución y el rol autorizado.',
 'No hay un botón de registro que convierta a cualquier persona en docente o familiar. Si olvidaste la contraseña, usa el enlace de acceso cuando esté disponible o solicita ayuda a la institución.',
 flow=['Tu correo','Acceso verificado','Tu espacio'])

page('instalar','Primeros pasos','Instalar y actualizar la APK','Android > Paquete oficial de MiCole',
 'La web funciona desde el navegador. La aplicación Android requiere el paquete oficial compatible con tu dispositivo.',[
 'Obtén la APK por el canal oficial indicado por tu institución u operador de MiCole. Esta guía utiliza la versión interna 18, compilada y firmada localmente.',
 'Abre el archivo en Android. Si pide autorizar la instalación, revisa que corresponda a la fuente oficial que utilizaste y sigue el diálogo del teléfono.',
 'Para actualizar, instala el paquete compatible sobre la versión anterior y elige Actualizar cuando aparezca. No desinstales para solucionar un rechazo de firma o versión.',
 'Abre MiCole y entra con tu cuenta. Concede notificaciones para recibir avisos; el permiso de ubicación se solicita para las funciones que lo necesitan.',
 'Si el paquete no se instala o una edición antigua deja de cargar, informa modelo y versión al responsable y solicita la compilación compatible. Conserva tu trabajo pendiente antes de salir.'
 ],'La app abre tu espacio y mantiene los registros guardados en el servicio.',
 'No necesitas ADB ni herramientas de desarrollador para el uso diario. Los permisos de notificaciones y ubicación no conceden un rol escolar. En un dispositivo compartido cada persona utiliza su sesión.',
 flow=['Paquete oficial','Instalar / actualizar','Entrar y revisar permisos'])
# Situar la instalación antes del primer acceso.
PAGES.insert(2,PAGES.pop())

page('navegacion','Primeros pasos','Moverte entre web y APK','Web > Menú / perfil | APK > Inicio / Más / perfil',
 'La presentación cambia con la pantalla y el modo de la sede; los permisos siguen siendo los de tu cuenta.',[
 'Comprueba el nombre de la institución. Si tienes varias sedes autorizadas, selecciona la correcta antes de registrar información.',
 'En la web abre el menú lateral. En un teléfono puede estar plegado. Más opciones conserva los módulos secundarios del modo kínder.',
 'En la APK usa los accesos inferiores para las tareas frecuentes y Más para buscar los demás módulos. La campana abre tus notificaciones.',
 'Con rol Familia, elige arriba al hijo correspondiente. Al cambiar de niño se actualizan cuidados, agenda, expediente y pagos de ese contexto.',
 'Abre tu perfil para cambiar de rol solo si tienes varios asignados. Al terminar en un teléfono compartido, cierra tu sesión.'
 ],'El aula, niño, sede y rol visibles deben coincidir con la tarea que vas a realizar.',
 'En web, Así fue su día corresponde a Cuidados diarios en la APK; Cuaderno del aula corresponde a Cuaderno digital; Aprendizajes reúne Evaluación y libretas.',
 photo=NEW+'madre-apk-restaurada.png',caption='APK de Familia: selector del hijo, campana y navegación inferior.')

page('permisos','Primeros pasos','Qué puede hacer cada rol',lead='Esta matriz resume las acciones de la interfaz. Las asignaciones y el contexto limitan cada operación.',kind='matrix')

page('cuentas-demo','Primeros pasos','Cuentas de test para demostrar MiCole',lead='Estas trece cuentas se usaron en las pruebas de web, APK y permisos. Los datos y pagos son ficticios.',kind='demo_accounts')

page('crear-aviso','Comunicación','Publicar un comunicado','Dirección o Docente > Comunicados > Nuevo comunicado',
 'Dirección publica para su sede; el docente trabaja dentro de sus aulas asignadas.',[
 'Completa Título, Tipo de aviso y Comunicado. Usa un mensaje concreto: qué sucede, a quién afecta y qué acción esperas.',
 'En Destinatarios, elige el aula. Dirección puede elegir toda la institución. Selecciona Familias, Toda la comunidad o Equipo docente.',
 'Si eliges niños concretos, revisa la lista antes de enviar. Sin selección individual se incluye el aula completa, según la audiencia.',
 'Solicitar He leído exige confirmación personal. Revisa también Recordar cada hora. La urgencia está reservada a salud y recojo.',
 'Guarda una sola vez y comprueba la publicación. Para corregir un aviso publicado, retíralo y crea una versión nueva; conserva su historial.'
 ],'El aviso aparece para sus destinatarios autorizados y el autor puede revisar sus lecturas.',
 'Los avisos académicos pueden llegar también a las cuentas estudiantiles habilitadas. Salud, recojo y confirmaciones obligatorias se reservan a los adultos correspondientes.',
 photo=NEW+'docente-apk-destinatario.png',caption='APK docente: un aula y un niño seleccionados. La selección limita el envío.')

page('avisos-importantes','Comunicación','Avisos que aparecen al entrar','Web o APK > Inicio / aviso en pantalla',
 'Un aviso importante requiere que lo revises dentro de MiCole, aunque no hayas recibido una notificación del teléfono.',[
 'Dirección o el docente activa la confirmación He leído al publicar. El aviso aparece a cada destinatario autorizado al entrar o volver a MiCole.',
 'Salud y recojo aparecen primero; después los pagos pendientes y los demás avisos importantes. Pulsa Marcar como leído si no requieren confirmación.',
 'En un comunicado obligatorio, marca He leído el aviso y pulsa Confirmar lectura. Antes de esa acción no se registra lectura ni confirmación.',
 'Si sales antes de confirmar, el aviso sigue pendiente. Mamá, papá, docentes y Dirección responden desde su propia cuenta cuando son destinatarios.',
 'Si estabas completando otro formulario, conserva y termina tu trabajo; el aviso se presenta cuando se cierre. Puedes cerrar sesión en lugar de confirmar.'
 ],'La lectura queda registrada con la cuenta y su fecha; abrir la app no confirma por ti.',
 'Confirmar lectura no autoriza actividades, salidas ni recojos. Los estudiantes reciben los avisos académicos permitidos; la confirmación de un adulto no se delega a una cuenta infantil.',
 photo=IMP+'apk18-aviso-obligatorio.png',caption='APK 18: aviso ficticio importante. Confirmar lectura requiere marcar He leído; no se confirma al abrir.')

page('pagos-importantes','Comunicación','Avisos de pago para mamá y papá','Al entrar > Aviso de pagos > Ver mis pagos',
 'Las cuotas pendientes se muestran desde cinco días antes de vencer, el día de vencimiento y después mientras quede saldo.',[
 'Comprueba el nombre del hijo, concepto, importe pendiente, fecha y si vence en cinco días, hoy o está vencida.',
 'El aviso reúne las cuotas de ese hijo. No incluye cuotas pagadas, anuladas ni las que vencen dentro de más de cinco días.',
 'Pulsa Marcar como leído después de revisarlo, o Ver mis pagos para abrir el estado de cuenta del hijo correcto.',
 'Cada padre registra su lectura por separado. Leer el aviso no registra un pago ni autoriza un cobro.',
 'Un abono cambia el importe avisado; cuando la cuota queda pagada deja de aparecer. Si sigue pendiente, puede mostrarse un recordatorio al día siguiente.'
 ],'Puedes anticipar el vencimiento y consultar el saldo real registrado por la institución.',
 'Salud y recojo aparecen antes que pagos. El recordatorio de la app no depende de tener activados los banners de Android. Un comprobante enviado debe ser revisado por el flujo correspondiente; no confirma por sí solo un pago.',
 photo=IMP+'apk18-pago-cinco-dias.png',caption='APK 18, datos ficticios: cuota de Emma por Bs 350, con vencimiento en cinco días.')

page('leer-aviso','Comunicación','Leer, confirmar y autorizar','Campana / Inicio > Aviso | Comunicados > Leer aviso',
 'Leer un comunicado, confirmar su lectura y autorizar una actividad son acciones diferentes.',[
 'Revisa el aviso que aparece al entrar o ábrelo desde la campana, Lo importante o Comunicados. Comprueba el hijo y su contenido.',
 'Si exige lectura, revisa el texto, marca He leído el aviso y pulsa Confirmar lectura. Abrirlo por sí solo no completa esa confirmación.',
 'Mamá y papá confirman desde sus cuentas respectivas. La acción de una persona no responde por la otra.',
 'Para una actividad usa su control Autorizo o No autorizo. Un pago o una confirmación de lectura no sustituye esa respuesta.',
 'Dirección y el docente autor abren Ver aviso y lecturas para revisar pendientes, filtrar y exportar el reporte cuando lo necesiten.'
 ],'El estado de lectura o confirmación queda asociado a la persona que actuó.',
 'Sin confirmar significa que falta una confirmación registrada; no significa rechazo. Soporte no acepta por la familia. El estudiante no recibe consentimientos privados.',
 photo=NEW+'padre-confirmacion-pendiente.png',caption='Ejemplo de confirmación personal: el botón se habilita al marcar He leído.')

page('notificaciones','Comunicación','Recibir avisos en el teléfono','APK > Configuración > Notificaciones | Ajustes de Android',
 'La campana de MiCole y la notificación que muestra Android son dos presentaciones del mismo circuito.',[
 'Entra con la cuenta destinataria en la APK. Abre Configuración y comprueba que los avisos de ese teléfono estén activados.',
 'Concede el permiso de notificaciones de Android y revisa las categorías que deseas recibir. Salud, tareas, mensajes y pagos pueden usar canales distintos.',
 'Si no suena, revisa volumen, canal, modo silencioso, No molestar y restricciones de batería. El permiso dentro de MiCole no anula esos ajustes.',
 'Pulsa el aviso para entrar al contenido autorizado. En una familia con hermanos, comprueba que se abrió el niño correspondiente.',
 'En la web consulta la campana. Los avisos recientes aparecen primero; los obligatorios siguen pendientes hasta que cada adulto confirme.'
 ],'El mensaje se consulta dentro de la app aunque Android no haya mostrado sonido o banner.',
 'El texto de bloqueo es genérico para proteger información privada. El descanso habitual es de 22:00 a 07:00 de Bolivia; salud o recojo urgentes pueden omitirlo. Forzar detención desde Android no equivale a cerrar normalmente la app.',
 photo=NEW+'estudiante-web-campana.png',caption='Campana web estudiantil: novedades académicas ordenadas por fecha.')

page('direccion-inicio','Dirección','Tu punto de partida','Web > Mi jornada | APK > Inicio',
 'Organiza la sede y supervisa la jornada. Antes de operar, verifica que los datos institucionales y las asignaciones estén completos.',[
 'Revisa la sede, la gestión y el modo de trabajo. Automático, Kínder y guardería o Colegio cambian la presentación del menú.',
 'Abre Preparar institución para completar identidad, requisitos, aulas, docentes, materias si se usan e inscripciones.',
 'Atiende fichas pendientes, permisos y recojos, materiales por aprobar, depósitos y solicitudes de factura desde sus módulos.',
 'Entra por Aulas del kínder para trabajar conservando el aula. Usa Niños y familias para localizar el expediente de un niño.',
 'Al final de la jornada contrasta asistencia, cuidados, solicitudes y avisos pendientes con el trabajo del equipo.'
 ],'Tu inicio y tus contadores reflejan únicamente la sede autorizada.',
 'Los cobros de la institución y el crédito/licencias de MiCole son conceptos separados. Las funciones disponibles dependen también de la preparación y habilitación de la sede.',
 photo=NEW+'direccion-web-restaurada.png',caption='Inicio de Dirección en la web con accesos a aulas, inscripción y preparación.')

page('identidad','Dirección','Identidad y página pública','Configuración > Editar identidad',
 'La página pública presenta la institución a nuevas familias. Los expedientes continúan dentro del espacio privado.',[
 'Completa nombre, ciudad, niveles, dirección, teléfono institucional y sitio web. Revisa el modo de trabajo de la sede.',
 'Carga logo y portada. Usa imágenes institucionales adecuadas para publicación; revisa el encuadre y la vista previa antes de guardar.',
 'Pega la ubicación de Google Maps y redacta la Presentación. Comprueba que el enlace abra el lugar correcto.',
 'Activa Mostrar institución en la página de MiCole si deseas la tarjeta y su página informativa. La institución debe estar activa.',
 'Elige por separado si publicas teléfono institucional, dirección y mapa. Guarda y abre Ver página pública para comprobar el resultado.'
 ],'La tarjeta del directorio abre la página informativa de esa institución.',
 'El carnet y celular privado de Dirección no se publican con el teléfono institucional. Si ocultas la institución, también se oculta su página pública. Una foto en la galería privada no se convierte en portada pública.',
 flow=['Identidad y portada','Tarjeta del directorio','Página informativa'])

page('aulas-equipo','Dirección','Crear aulas y asignar al equipo','Aulas del kínder / Aulas y cursos > Nueva aula | Equipo docente',
 'Prepara el aula y sus responsables antes de inscribir o publicar contenido.',[
 'Elige la gestión y registra aula, nivel, horario, días, capacidad y precio base cuando corresponda. Revisa si admite nuevas inscripciones.',
 'Registra al docente con su correo correcto y vincúlalo a una o varias aulas. Un aula puede tener más de un docente autorizado.',
 'Comparte la invitación por el mecanismo disponible y comprueba que la persona ingrese con ese correo.',
 'Si trabajan por materias, habilítalas en el aula, crea o reutiliza el catálogo y asigna los docentes de cada materia.',
 'Asigna tutora o jefe de aula cuando corresponda. Al retirar a una persona, revisa también sus aulas, tutoría y materias.'
 ],'Cada docente encuentra sus aulas y las acciones que le corresponden.',
 'Los cupos cuentan inscripciones activas y pendientes. Un contacto de emergencia no obtiene acceso docente o familiar. En Inicial puedes trabajar sin materias y usar Desarrollo integral.',
 flow=['Gestión y aula','Docentes asignados','Niños y jornada'])

page('inscribir','Dirección','Inscribir sin duplicar registros','Niños y familias / Estudiantes > Inscribir',
 'La inscripción reúne niño, responsables, aula y plan. Revisa cada paso antes del guardado final.',[
 'Selecciona gestión y aula. Comprueba cupo y los requisitos institucionales, incluida la lista anual de materiales si es obligatoria.',
 'Completa los datos del niño y los responsables exigidos por la sede. Madre y padre deben usar correos distintos cuando se registran ambos.',
 'Revisa el plan: meses, cuotas, mensualidad y otros conceptos aplicables. Comprueba fechas y descuento antes de guardar.',
 'Guarda y abre el expediente para verificar aula, responsables y cuotas. Si hubo una respuesta de red incierta, consulta primero y reintenta el mismo pedido.',
 'Para importación masiva, descarga la plantilla CSV, completa sus columnas, previsualiza y resuelve los errores antes de confirmar el archivo.'
 ],'Aparece un único expediente con su inscripción y plan correspondientes.',
 'La importación admite hasta 200 filas y 1 MB por CSV. Usa fechas AAAA-MM-DD y los nombres de aula requeridos por la plantilla. Previsualizar no guarda; confirmar el archivo no debe dejar filas a medias.',
 flow=['Datos y responsables','Revisar plan y aula','Guardar y verificar'])

page('expediente','Dirección','Revisar ficha y documentos','Niños y familias > Ver expediente',
 'El expediente concentra información de cuidado, familia, asistencia y documentación del niño.',[
 'Abre el niño correcto y revisa Resumen, Salud y emergencias, Familia y recojos y Asistencia.',
 'Completa la ficha o comparte su enlace de manera privada con el responsable. Al recibirla, revisa las respuestas y aprueba cuando corresponda.',
 'Comprueba contactos, restricciones alimentarias, indicaciones de cuidado y la declaración informativa de emergencias. No sustituyas el procedimiento presencial.',
 'En Documentos, carga o consulta los archivos permitidos para ese expediente. Verifica el niño antes de adjuntar.',
 'Para cuentas estudiantiles opcionales usa Acceso del estudiante: correo propio, distinto al de adultos, habilitación y posterior revocación si corresponde.'
 ],'La ficha revisada y los archivos permanecen asociados al niño autorizado.',
 'Un enlace de ficha no crea una cuenta familiar. Las personas autorizadas para recojo y los contactos de emergencia tampoco reciben acceso automático a MiCole.',
 photo=FULL+'inscripcion-apk-ficha-final.png',caption='APK: un paso de la ficha familiar. Las decisiones se eligen expresamente.')

page('planes','Dirección','Planes, cuotas y acceso familiar','Pagos y mensualidades > Plan / Precios para nuevas cuotas',
 'Distingue precio configurado, cuota emitida, abono recibido y saldo pendiente.',[
 'Revisa el niño y los meses del plan. Configura importes y conceptos aplicables a ese nivel y sede antes de emitir cuotas.',
 'Consulta importe original, total abonado y saldo. Un abono reduce el saldo; no convierte el importe original en un valor nuevo.',
 'Usa Precios para nuevas cuotas para cambios futuros. Las cuotas ya emitidas no se recalculan al cambiar el precio o descuento.',
 'Si corresponde un aumento de una cuota pendiente, usa la acción autorizada con motivo. Revisa antes las reservas QR activas.',
 'Un plazo de acceso temporal autorizado conserva la deuda. Comprueba además ficha, inscripción, habilitación institucional y condiciones del nivel.'
 ],'El estado de cuenta coincide con los conceptos emitidos y los cobros efectivamente registrados.',
 'En el esquema de Inicial/guardería, el acceso por abonos puede exigir 50% y las últimas dos cuotas 100%. Las sedes de primaria/secundaria tienen reglas específicas. No cambies de nivel para eludir una regla ni supongas que todos los colegios comparten la misma política.',
 photo=OLD+'c05-apk-saldo229.png',caption='Ejemplo ficticio de saldo restante después de un abono; los importes son ilustrativos.')

page('caja','Dirección','Cobrar y emitir un recibo','Caja y cobros > Seleccionar cuotas > Registrar cobro',
 'Registrar dinero y emitir una factura fiscal son procesos distintos.',[
 'Selecciona al niño y las cuotas que vas a cobrar. Puedes combinar conceptos y ajustar cada abono dentro de su saldo.',
 'Elige el método disponible. Para transferencia, depósito o QR corroborado manualmente, contrasta el ingreso y completa su referencia.',
 'Revisa el total y guarda una vez. Si la respuesta fue incierta, consulta los recibos y saldos antes de repetir o crear otro pedido.',
 'Abre Estado de cuenta por niño para revisar cuotas, abonos y recibos. Exporta CSV o imprime/guarda PDF cuando necesites una copia.',
 'Si se solicita factura, registra los datos exigidos. En Facturas incorpora el número y archivo emitidos externamente y completa su estado.'
 ],'Existe un recibo por el dinero recibido, y el saldo del niño refleja sus abonos.',
 'La vista previa de factura no tiene validez fiscal por sí misma. MiCole no emite automáticamente una factura del sistema tributario. El docente solo puede corroborar conceptos aprobados de actividades/materiales de sus aulas, no mensualidades.',
 flow=['Confirmar ingreso','Recibo y abonos','Factura si se solicita'])

page('comprobantes','Dirección','Revisar depósitos y QR','Caja y cobros > Comprobantes / Pagos QR | Configuración > Banco',
 'Un comprobante presentado por la familia aún debe verificarse.',[
 'Abre la solicitud, revisa niño, cuotas, importes, fecha, referencia y adjunto privado.',
 'Contrasta el ingreso real en la cuenta institucional. Aprobar genera los abonos y el recibo; observar exige motivo y conserva el saldo anterior.',
 'Si los saldos cambiaron, revisa el pedido antes de aprobar. No reutilices una referencia bancaria para registrar dos cobros.',
 'Con QR bancario habilitado, consulta el estado del proveedor. Solo su confirmación autorizada acredita el dinero; una imagen del QR no es pago.',
 'Si hay una generación incierta o reserva activa, comprueba o cancela por el flujo bancario. No liberes una reserva ni registres otro cobro a ciegas.'
 ],'El ingreso verificado se aplica una vez; las discrepancias quedan para revisión.',
 'La conexión bancaria requiere configuración y un cobro controlado previo con el titular. Las pruebas ficticias y la autenticación del proveedor no demuestran que se acreditó dinero real. La cuenta escolar y la cuenta de MiCole son independientes.',
 flow=['Presentado / generado','Verificación','Aplicado o en revisión'])

page('materiales-actividades','Dirección','Aprobar materiales y actividades','Materiales / Actividades y salidas > Revisar solicitud',
 'El docente propone; Dirección revisa y decide sobre la publicación y sus costos.',[
 'Abre la solicitud y comprueba aula, gestión, detalle, fecha y costo. Distingue lista anual, pedido específico y actividad.',
 'Aprueba o rechaza con el motivo correspondiente. Solo lo aprobado se publica para las familias.',
 'Revisa los participantes y cargos creados. Un niño inscrito después no debe heredar automáticamente cobros de actividades pasadas.',
 'Consulta las respuestas Autorizo o No autorizo por persona. Haber pagado o estar en la lista de participantes no constituye consentimiento.',
 'Para no participación o cambios con dinero ya abonado, revisa el caso y su motivo antes de modificar. No se realiza una devolución automática.'
 ],'La publicación aprobada coincide con participantes, condiciones y cobros revisados.',
 'Una publicación aprobada conserva su contenido. Para cambiar el pedido se prepara otra solicitud. La lista anual puede ser un requisito de inscripción en Inicial según la configuración de la sede.',
 flow=['Propuesta docente','Revisión de Dirección','Publicación y respuestas'])

page('agenda-importacion','Dirección','Preparar agenda y formularios','Agenda del kínder > Agregar evento / Importar calendario | Formulario de inscripción',
 'Los eventos pueden corresponder a una sola aula o a toda la sede.',[
 'Para un evento manual, elige título, fecha o intervalo, aula y descripción. Revisa el alcance antes de guardar.',
 'Para importar, selecciona gestión y aula o institución. Usa plantillas vacías y calendarios sin información personal.',
 'Si eliges Leer con Gemini, compara todas las preguntas o fechas sugeridas con el documento original. Corrige o desmarca lo incorrecto.',
 'Confirma expresamente la revisión antes de publicar. La ayuda automática no aprueba ni publica por tu cuenta.',
 'Consulta la agenda como destinatario autorizado. Las entrevistas privadas aparecen solo para sus participantes y personal permitido.'
 ],'Solo las preguntas y actividades revisadas quedan publicadas en su contexto.',
 'La lectura asistida admite hasta tres PDF/fotos, 5 MB por archivo y 10 MB en total. No subas fichas ya llenas con datos de niños. Cambiar una plantilla no modifica los enlaces familiares anteriores.',
 photo=FULL+'estudiante-web-agenda.png',caption='Vista autorizada de agenda: eventos del aula y de la sede.')

page('personal-direccion','Dirección','Llegadas, jornadas y boletas','Asistencia del equipo > Configurar ubicación y reglas | Boletas de pago',
 'El control laboral del equipo es distinto de la asistencia de alumnos.',[
 'Define ubicación real de la sede, radio y precisión GPS. Activa el control de llegada cuando vayas a utilizarlo.',
 'Asigna días y turnos sin superposición, descansos y modalidad de remuneración. Revisa horarios antes del piloto.',
 'Consulta entradas y salidas. Ante olvido o ubicación imprecisa, usa la corrección justificada de Dirección, conservando el historial.',
 'Prepara la boleta del mes y revisa conceptos y marcaciones. Recalcular un borrador puede reemplazar sus conceptos manuales.',
 'Aprueba cuando corresponda, con las revisiones exigidas. Registra un pago solo después de efectuarlo por el medio elegido.'
 ],'Jornada, cálculos revisados y boleta reflejan estados diferentes y trazables.',
 'Los descuentos requieren activación y respaldo institucional. Aprobar una boleta no significa pagarla; MiCole no transfiere dinero al personal. Una coordenada de teléfono no es prueba infalible de presencia.',
 photo=OLD+'j10-web-turno-cerrado.png',caption='Ejemplo web: una jornada ficticia con entrada, salida y duración.')

page('evaluacion-direccion','Dirección','Configurar y publicar aprendizajes','Aprendizajes / Evaluación y libretas',
 'En Inicial pueden usarse etiquetas cualitativas y Desarrollo integral, según el aula.',[
 'Configura gestión, periodos y sus fechas. Revisa si el aula usa materias y qué modelo de evaluación corresponde.',
 'Desde Reglas de notas define etiquetas, cálculos y límites de corrección. Las columnas con notas conservan su escala.',
 'Comprueba evaluaciones, pendientes y exenciones. Una nota faltante no se interpreta como cero y una etiqueta no se convierte en número.',
 'Antes del cierre, completa las condiciones requeridas. Publicar una libreta conserva la fotografía de ese resultado.',
 'Para corregir una publicación usa la reapertura con motivo, revisa y vuelve a cerrar. La familia consulta publicaciones, no los borradores internos.'
 ],'Las libretas publicadas coinciden con las evaluaciones revisadas.',
 'El modelo numérico de colegio no se activa por el nombre del aula. Las reglas institucionales deben revisarse en cada gestión; una libreta de MiCole no constituye una certificación oficial automática.',
 flow=['Periodos y reglas','Evaluar y revisar','Publicar libreta'])

page('gestiones','Dirección','Cambiar de gestión o de aula','Gestiones e historial > Nueva gestión / Reinscribir',
 'Conserva a la persona y su historia; prepara conscientemente el aula y el plan nuevos.',[
 'Crea la gestión de destino y copia las aulas cuando corresponda. Revisa capacidad, docentes, horarios, materias y requisitos.',
 'Selecciona al niño y el aula de destino. Indica el motivo de reinscripción o traslado y confirma las validaciones.',
 'Comprueba que continúan sus vínculos familiares, documentos, historial y saldos. El cambio de aula no borra cuotas anteriores.',
 'Prepara el nuevo plan de pagos desde Mensualidades. Reinscribir no crea por sí solo todos los cobros del año siguiente.',
 'Para retirar a un niño usa Baja con motivo. Revisa qué cuotas futuras sin abonos se cancelan y qué deuda/historia se conserva.'
 ],'La inscripción nueva y la historia anterior quedan diferenciadas.',
 'Cerrar la gestión es una decisión académica: no sustituye una baja ni detiene todos los cobros. Los casos de Inicial no se promueven por una suposición automática de grado.',
 flow=['Preparar destino','Reinscribir con motivo','Revisar plan e historia'])

page('sede-mixta','Dirección','Funciones de una sede mixta','Más opciones > Gestión educativa Bolivia / Promoción anual',
 'Este recorrido complementario corresponde a aulas de primaria o secundaria configuradas como tales; no transforma la operación de guardería.',[
 'Asigna el grado y modelo de cada paralelo de forma explícita. Revisa el perfil y las referencias de la gestión antes de confirmarlo.',
 'Gestiona planificación POA/PDC y documentos de apoyo con los estados Borrador, En revisión, Aprobado o Devuelto, según el módulo.',
 'Para reforzamiento revisa notas completas, motivo y respaldos requeridos. El docente registra; Dirección revisa la aprobación correspondiente.',
 'En Promoción anual comprueba publicaciones y cierre del origen, aula de destino compatible y capacidad. Revisa los casos pendientes individualmente.',
 'Exporta los informes internos disponibles. Verifica por separado el procedimiento y los formatos oficiales que deban utilizarse.'
 ],'Cada nivel conserva su configuración y el equipo no aplica reglas de colegio por accidente a Inicial.',
 'Los informes internos y exportaciones no equivalen a un envío ministerial ni a una certificación integral. La normativa y las excepciones de cada nueva gestión deben revisarse con el responsable educativo.',
 flow=['Perfil del aula','Respaldo y revisión','Publicación / promoción'])

page('supervision-direccion','Dirección','Reportes, sedes y ayuda','Reportes | Historial de consultas | Sedes y sucursales | Configuración',
 'Consulta datos del ámbito autorizado y conserva el contexto al exportar.',[
 'Filtra Reportes por periodo, aula o niño. Distingue ingresos recibidos, cuotas emitidas y saldos pendientes.',
 'Exporta CSV o imprime/guarda PDF desde el módulo que lo ofrece. Revisa los filtros y el destinatario antes de compartir el archivo.',
 'En Historial de consultas revisa aperturas o descargas registradas. Son señales de presentación, no prueba de comprensión ni consentimiento.',
 'En Sedes y sucursales verifica niveles y responsables. Cambiar de sede no copia automáticamente banco, saldos ni todos los permisos.',
 'Usa Ayuda MiCole para orientarte y preparar un borrador. Revisa y guarda mediante el formulario normal; la ayuda no aprueba pagos ni recojos.'
 ],'Obtienes el reporte y la ayuda de la sede correcta sin confundir saldos o consentimientos.',
 'Comparte archivos solo con las personas autorizadas. Si detectas una mezcla de alumnos o sedes, detén la operación y reporta el contexto antes de seguir.',
 flow=['Elegir contexto','Filtrar y revisar','Exportar o actuar'])

page('docente-inicio','Docente','Organizar tu jornada','APK > Inicio / Mis aulas | Web > Mi jornada',
 'Tu trabajo se concentra en las aulas y materias que Dirección te asignó.',[
 'Verifica tu nombre, sede y rol. Si falta un aula, pide a Dirección revisar la asignación; cambiar de menú no concede permisos.',
 'Entra en Mis aulas y abre la jornada del grupo. Mantén seleccionados aula, fecha y materia al trabajar.',
 'Comienza por asistencia y revisa novedades de cuidado y contactos operativos de los niños autorizados.',
 'Durante el día registra cuidados, cuaderno y aprendizajes. Publica avisos con destinatarios concretos cuando haga falta.',
 'Antes de salir revisa entregas, solicitudes, entrevistas y tu marcación laboral si la sede usa ese control.'
 ],'Cada registro queda dentro del aula y la jornada que seleccionaste.',
 'La función de tutora amplía la consulta del seguimiento del aula; no autoriza calificar materias de otro docente ni editar sus registros.',
 photo=FULL+'docente-b-apk-inicio.png',caption='APK docente: accesos a entrada/salida, lista, cuidados y aulas.')

page('permisos-lista','Docente','Revisar permisos antes de pasar lista','Asistencia de alumnos > Aula y fecha > Permisos antes de pasar lista',
 'El pedido de ausencia de una familia debe revisarse antes de confirmar la lista.',[
 'Selecciona tu aula y fecha. Si hay pedidos familiares, el modal muestra niño, motivo, estado y respuesta.',
 'Escribe una respuesta de al menos cinco caracteres. Acepta o rechaza cada permiso según corresponda; Dirección puede consultar.',
 'No se puede continuar con pedidos pendientes. Al terminar pulsa Continuar con la lista.',
 'Un permiso aceptado propone Con permiso. Si el niño finalmente asistió, conserva Presente o Tardanza según lo ocurrido.',
 'Si llega otro pedido mientras preparas la lista, actualiza y revísalo. Un permiso recibido después de confirmar se atiende con corrección justificada.'
 ],'La lista contempla los permisos aceptados y evita una falsa falta.',
 'El permiso no confirma por sí solo la lista. Un permiso aceptado impide confirmar al niño como Falta; un rechazo tampoco genera una falta automática.',
 photo=ATT+'apk17-modal-permiso.png',caption='APK 17: el docente revisa el pedido de Lucía. Continuar permanece bloqueado hasta responder.')

page('lista','Docente','Pasar lista y confirmar','Asistencia de alumnos > Aula y fecha',
 'Sin marcar no significa falta. Solo el docente asignado marca la lista.',[
 'Revisa los permisos familiares y selecciona Presente, Falta, Tardanza o Con permiso para cada niño.',
 'Marcar pendientes como presentes conserva los estados ya elegidos. Agrega las observaciones visibles para la familia.',
 'Usa Guardar borrador si continuarás después. El borrador no publica asistencia ni genera avisos de falta.',
 'Revisa el resumen y confirma cuando todos tengan estado. Las faltas explícitas se notifican a mamá y papá vinculados.',
 'Después de confirmar, usa Correcciones con justificativo si detectas un error. Dirección consulta y no cambia la asistencia.'
 ],'La familia ve la lista confirmada; el original queda protegido.',
 'Un día sin lista confirmada no equivale a una ausencia. No registres otra lista para ocultar un error; utiliza la corrección del docente.',
 photo=ATT+'apk17-lista-con-permiso.png',caption='APK 17: permiso propuesto para Lucía antes de confirmar; el resumen indica cero faltas.')

page('corregir-lista','Docente','Corregir con justificativo','Asistencia de alumnos > Correcciones con justificativo',
 'Solo el docente asignado corrige. Dirección consulta el historial sin aprobar ni modificar.',[
 'Abre el historial y pulsa Corregir con justificativo. Selecciona alumno, fecha y estado corregido.',
 'Completa la observación que verá la familia y el justificativo interno obligatorio de cinco a mil caracteres.',
 'Revisa antes de pulsar Guardar corrección y avisar. La corrección se aplica y se notifica a los padres vinculados.',
 'Comprueba en el historial el estado anterior, el nuevo y el motivo. El registro original confirmado se conserva.',
 'Si otra sesión corrigió primero, actualiza y revisa su resultado antes de volver a guardar; no sobrescribas un cambio nuevo.'
 ],'La familia consulta el estado corregido y su observación, conservando la trazabilidad.',
 'El justificativo interno se comparte con el docente y Dirección. La vista familiar no muestra ese motivo ni las correcciones de otros niños.',
 photo=ATT+'apk17-historial-corregido.png',caption='APK 17: historial desplazable de la corrección docente, de Con permiso a Presente.')

page('cuidado-individual','Docente','Registrar un cuidado individual','Cuidados diarios / Así fue su día > Registrar cuidado',
 'Selecciona al niño correcto antes de registrar información personal.',[
 'Elige niño, fecha hasta hoy y tipo: alimentación, descanso, higiene, ánimo o incidente según el formulario.',
 'Para alimentación indica alimento y cantidad. Para descanso registra inicio y fin coherentes. En higiene o ánimo selecciona su opción.',
 'Escribe una observación concreta y útil para su familia. Evita incluir información de otro niño en la misma nota.',
 'Guarda y verifica el resumen del niño y del día. Si necesitas corregir, utiliza la acción disponible del registro individual.',
 'Ante una respuesta de conexión incierta, conserva el formulario y consulta el resultado antes de generar un pedido distinto.'
 ],'La familia encuentra el cuidado y la observación dentro del resumen de su hijo.',
 'Un registro de cuidado no marca asistencia. Los incidentes se mantienen individuales. En una emergencia aplica el procedimiento de la institución y su canal de atención; un aviso en la app no confirma atención presencial.',
 photo=OLD+'j04-apk-guardado.png',caption='Ejemplo de un cuidado registrado desde Android en un expediente ficticio.')

page('cuidado-grupal','Docente','Registrar cuidados para el aula','Web > Así fue su día > Registrar para el aula',
 'El lote agiliza datos comunes y permite una observación diferente para cada niño.',[
 'Elige aula, día, tipo de cuidado y hora. Completa los datos que comparte el grupo.',
 'Selecciona únicamente los niños que recibieron ese cuidado. La selección comienza vacía; puedes seleccionar todos y excluir a quien no corresponda.',
 'Pulsa Revisar registros. Ajusta por niño cantidad, fin de descanso, higiene o ánimo, y su observación particular.',
 'Revisa incluidos y excluidos, y pulsa Guardar cuidados una vez. Si un registro es inválido, se debe corregir el lote antes de guardarlo completo.',
 'Comprueba a dos niños y a uno excluido. Su familia debe ver solo sus registros y su propia observación.'
 ],'Todos los incluidos reciben el registro adecuado y los excluidos no reciben ese lote.',
 'La interfaz de lote documentada está en la web publicada. En APK puedes consultar el resultado y usar el registro individual. Si falla la red, reabre el mismo pedido durante la sesión para reintentar sin duplicarlo.',
 photo=FULL+'grupo-web-seleccion.png',caption='Web en teléfono: dos niños seleccionados y otro excluido del lote.')

page('cuaderno-galeria','Docente','Cuaderno y momentos del aula','Cuaderno del aula / Cuaderno digital | Momentos del aula / Galería',
 'Distingue una tarea para el estudiante de una observación privada para los adultos.',[
 'En el cuaderno elige niño o aula, fecha y categoría. Redacta una nota comprensible para sus destinatarios.',
 'Usa Tarea cuando deba estar disponible en el portal estudiantil. Una observación privada no se muestra a la cuenta infantil.',
 'Guarda y revisa el niño y categoría resultantes. Las familias consultan el seguimiento autorizado de sus hijos.',
 'En Galería selecciona al niño correspondiente, agrega la imagen y su descripción por el flujo de carga privado.',
 'Comprueba la carga y la visualización. No uses la galería para adjuntar el carnet de un recojo ni para publicar una foto en la landing.'
 ],'El contenido queda en el módulo y destinatario adecuados.',
 'Un enlace temporal de descarga no es una dirección pública permanente. Utiliza imágenes con la autorización institucional correspondiente y evita datos de terceros en las descripciones.',
 photo=FULL+'cuaderno-apk16-madre.png',caption='APK familiar: observación del cuaderno de un único niño.')

page('tareas-docente','Docente','Publicar y revisar tareas','Tareas y entregas > Nueva tarea / Entregas',
 'Las tareas formales tienen estados y entregas personales; una nota del cuaderno no sustituye ese flujo.',[
 'Selecciona aula y materia si se utiliza. Completa título, instrucciones, fecha límite y puntuación opcional; decide si admite entregas atrasadas.',
 'Guarda borrador o publica. Si será puntuable en la planilla, revisa periodo, columna, peso y dimensión aplicable antes de publicar.',
 'Abre las entregas y el trabajo del estudiante autorizado. Revisa texto y archivos disponibles.',
 'Registra comentarios y puntuación cuando corresponda. Devuelve para corregir o marca revisada según el resultado.',
 'Consulta de nuevo la entrega y, si está vinculada, la planilla. Un periodo cerrado o un límite de correcciones puede impedir guardar la revisión.'
 ],'El estudiante y su familia ven el estado de la entrega y la devolución autorizada.',
 'Una entrega revisada queda cerrada para el alumno hasta que sea devuelta. Cerrar una tarea limita nuevas entregas. Los faltantes no deben transformarse en una nota inventada.',
 photo=OLD+'c02-web-entrega-desde-apk.png',caption='Web docente: entrega recibida desde la APK del estudiante.')

page('seguimiento-docente','Docente','Evaluar, coordinar y entrevistar','Aprendizajes > Planilla | Aula > Tutoría | Entrevistas',
 'Trabaja con las materias asignadas y separa coordinación interna de información familiar.',[
 'Selecciona aula, materia y periodo. Completa notas o etiquetas cualitativas desde la planilla; una casilla numérica se guarda al salir o pulsar Enter.',
 'Revisa el guardado, pendientes y límites de modificación. Una nota exenta requiere motivo; un resultado pendiente no es cero.',
 'Si eres tutora o jefe de aula, consulta su seguimiento completo sin modificar la materia de otro docente.',
 'Para una entrevista elige niño, materia, participantes, fecha, lugar y motivo. Comprueba quién respondió y quién sigue pendiente.',
 'Si reprogramas, revisa las nuevas confirmaciones. Mensaje al profesor mantiene la coordinación interna separada de la conversación con la familia.'
 ],'La evaluación y las entrevistas conservan autor, contexto y respuestas personales.',
 'La respuesta de una entrevista no se deduce de abrir su aviso. Solicitar otro horario o no poder asistir exige motivo. Las notas internas entre docentes no se convierten en mensajes familiares.',
 flow=['Seguimiento del aula','Convocar y responder','Revisar el resultado'])

page('entrada-docente','Docente','Marcar entrada y salida al trabajo','APK > Mi entrada / Asistencia del equipo',
 'La institución debe haber activado el control y configurado tu turno y la ubicación.',[
 'Activa la ubicación del teléfono y concede a MiCole el permiso solicitado durante el uso. Mantén conexión a internet.',
 'Pulsa Verificar mi ubicación. Espera una lectura precisa y dentro del radio que configuró Dirección.',
 'Cuando se habilite, pulsa Marcar entrada. La app verifica otra lectura y guarda la hora del servidor.',
 'Al terminar, verifica ubicación de nuevo y marca salida. Una entrada abierta debe cerrarse antes de registrar otra.',
 'Consulta tus registros y, cuando estén aprobadas, tus boletas. Si olvidaste marcar o el GPS no permite hacerlo, informa a Dirección para una corrección con motivo.'
 ],'Tu jornada muestra una entrada y, al finalizar, una salida correctamente registradas.',
 'La lectura de ubicación vence a los 90 segundos. No se registran entradas sin conexión ni hay seguimiento GPS en segundo plano. Esta marcación laboral no registra la presencia de los alumnos.',
 photo=OLD+'j02-apk-entrada.png',caption='APK: jornada abierta con el botón de salida y los registros del mes.')

page('familia-inicio','Familia','Entrar y completar la ficha','Inicio > Mi hijo o hija / Mis hijos > Completar cuidados',
 'Mamá y papá usan sus cuentas propias, vinculadas por sus correos verificados.',[
 'Comprueba tu nombre, institución y lista de hijos. Selecciona a quien vas a consultar; no reutilices la cuenta de otro adulto.',
 'Si falta un hijo, pide a Dirección revisar el correo registrado y el vínculo. Un contacto de emergencia no recibe acceso por estar en la ficha.',
 'Completa los datos de salud, restricciones alimentarias, seguro y contactos exigidos. Revisa también las preguntas de la plantilla de la institución.',
 'Elige expresamente las declaraciones y completa nombre y documento cuando se soliciten. Guarda al final y avisa si queda revisión de Dirección pendiente.',
 'Actualiza información que haya cambiado y confirma con la institución las indicaciones importantes de cuidado.'
 ],'Puedes consultar el expediente y la jornada del hijo correcto con la ficha revisada.',
 'Compartir la ficha por enlace no equivale a crear una cuenta. La declaración de emergencias es informativa y no sustituye una firma o una atención médica.',
 photo=FULL+'familia-b-web-hijos.png',caption='Web familiar: selector de los hijos vinculados a esa cuenta.')

page('familia-dia','Familia','Consultar su día y asistencia','Así fue su día / Cuidados diarios | Asistencia de alumnos',
 'La consulta familiar muestra la información de sus propios hijos.',[
 'Selecciona el hijo y la fecha. Revisa alimentación, cantidad, descanso, higiene, ánimo e incidentes registrados.',
 'Lee las observaciones de ese niño. Al cambiar de hermano, comprueba que nombre y resumen cambien de contexto.',
 'Consulta Asistencia para ver el estado confirmado y sus observaciones. Una lista sin confirmar no equivale a una falta.',
 'Abre Cuaderno digital y Galería para las novedades e imágenes permitidas. El archivo se consulta dentro del acceso privado.',
 'Si hay un dato incorrecto o una ausencia que requiere aclaración, contacta a la institución; la familia no edita los registros docentes.'
 ],'Encuentras el mismo seguimiento autorizado en web y APK.',
 'Los avisos de lectura y la asistencia esencial pueden seguir disponibles con acceso académico pausado; eso no desbloquea automáticamente otros módulos.',
 photo=FULL+'familia-b-web-sofia.png',caption='Web: alimentación y observación individual del niño seleccionado.')

page('familia-comunicar','Familia','Mensajes, entrevistas y lecturas','Mensajes | Entrevistas | Comunicados',
 'Usa cada módulo para la respuesta que corresponde, sin confundir lectura con consentimiento.',[
 'En Comunicados abre el aviso y, si se exige, confirma He leído desde tu cuenta. El otro progenitor responde desde la suya.',
 'Para comunicar una situación usa Mensajes en el contexto de tu hijo. Comprueba el hilo antes de enviar información personal.',
 'En Entrevistas revisa personas, lugar, fecha y motivo. Indica que asistirás o solicita otra opción con el motivo requerido.',
 'Si se reprograma, responde al nuevo horario. La respuesta anterior no confirma la revisión nueva.',
 'Ante una situación urgente sigue el canal y procedimiento de la institución; un mensaje enviado no demuestra que alguien ya lo atendió.'
 ],'La institución consulta tu respuesta y sus pendientes desde la cuenta que actuó.',
 'Las notificaciones Android son genéricas; abre MiCole para leer los detalles privados. Los mensajes de coordinación interna entre docentes no forman parte de tu conversación familiar.',
 photo=NEW+'padre-web-apertura.png',caption='Web de papá: apertura del aviso que el docente creó desde la APK.')

page('familia-recojo','Familia','Solicitar un permiso o recojo','Permisos y recojos > Nueva solicitud / Autorizar recogida',
 'El recojo tiene una autorización concreta y una comprobación presencial de identidad.',[
 'Para ausencia, elige hijo, fecha y motivo. Envía el pedido; el docente del aula lo acepta o rechaza con una respuesta antes de confirmar la lista.',
 'Para recojo, selecciona al hijo y fecha, y completa nombre, documento y relación de la persona autorizada, según el formulario.',
 'Adjunta una foto legible de su carnet en JPG, PNG o WebP de hasta 5 MB. Espera la carga antes de enviar.',
 'Consulta el estado: pendiente, aprobado u observado/rechazado según la decisión. Si se requiere corrección, presenta los datos por el flujo indicado.',
 'El día de entrega, el personal compara presencialmente a la persona con el carnet. La confirmación de identidad y entrega corresponde al personal autorizado.'
 ],'La familia y la institución consultan la misma solicitud y decisión.',
 'Agregar un autorizado a la ficha no reemplaza una solicitud concreta. Aprobar no demuestra que el niño ya fue entregado. El carnet se conserva en el archivo privado de la solicitud, no en la galería.',
 photo=OLD+'j08-apk-aprobacion-web.png',caption='APK familiar: autorización aprobada. El ejemplo no representa una entrega real.')

page('familia-pagos','Familia','Consultar pagos, comprobantes y factura','Pagos / Caja > Estado de cuenta por niño | Facturas',
 'Puedes consultar tus saldos; confirmar un ingreso corresponde al flujo autorizado de la institución o del banco.',[
 'Selecciona al hijo y revisa cuotas, abonos, saldo y recibos. Comprueba concepto y periodo antes de pagar.',
 'Si está habilitado el QR bancario, genera o abre el enlace correspondiente y sigue su estado. Un QR generado aún no es dinero acreditado.',
 'Para depósito o transferencia, informa el comprobante con sus cuotas, importes, fecha, referencia y archivo. Espera la revisión.',
 'Si necesitas factura, completa nombre o razón social, NIT/CI y celular en el flujo disponible. Se solicita sobre el dinero efectivamente recibido.',
 'Cuando la factura figure emitida con archivo, descárgala desde tu acceso. Si el saldo o estado no coincide, consulta a Dirección con el recibo y referencia.'
 ],'Tu cuenta muestra el recibo y saldo que fueron confirmados, y la factura cuando esté disponible.',
 'Informar un comprobante no reduce la deuda. La app no ejecuta devoluciones automáticas. El estudiante no consulta pagos ni datos fiscales.',
 photo=OLD+'c05-apk-saldo229.png',caption='Ejemplo de saldo familiar tras un abono ficticio. Revisa siempre el importe vigente.')

page('familia-agenda','Familia','Agenda, materiales y aprendizajes','Agenda | Materiales / Actividades | Aprendizajes',
 'Los contenidos corresponden al aula y a la institución de tu hijo.',[
 'Consulta el calendario del mes y los detalles de cada fecha. Revisa aula, rango de fechas y las próximas actividades.',
 'En Materiales consulta las listas y solicitudes aprobadas. Un borrador docente no es todavía un pedido publicado para la familia.',
 'En una actividad responde Autorizo o No autorizo desde el control de autorización. Revisa también participación y costo si corresponden.',
 'Consulta tareas y revisiones de tu hijo. La entrega personal la realiza la cuenta de estudiante habilitada, no la cuenta familiar.',
 'En Aprendizajes consulta las libretas publicadas y comentarios disponibles. Si el módulo está pausado, revisa ficha, estado y condiciones de acceso con Dirección.'
 ],'Tu respuesta y las consultas quedan dentro del hijo y actividad correctos.',
 'Pagar una salida no equivale a autorizarla. Las tareas, notas y libretas no se editan desde Familia.',
 photo=FULL+'estudiante-web-agenda.png',caption='Ejemplo de agenda autorizada. El selector familiar determina el hijo consultado.')

page('estudiante-inicio','Estudiante','Usar tu espacio personal','Inicio > Tareas / Agenda / Comunicados',
 'La cuenta estudiantil es opcional y debe habilitarla Dirección con un correo propio.',[
 'Ingresa con tu correo verificado. Comprueba que el inicio muestre tu nombre y aula.',
 'Consulta los avisos recientes y abre tareas, agenda, materiales y horarios publicados que correspondan a tu acceso.',
 'Abre las tareas del cuaderno que publicó tu docente. Las observaciones privadas para adultos no forman parte de este espacio.',
 'Si el acceso está en pausa, pide a tu familia o Dirección revisar tu inscripción y ficha. No necesitas ver importes ni datos personales de adultos.',
 'Cierra tu sesión al usar un dispositivo compartido. Cambiar de cuenta o de aula debe cambiar el contexto autorizado.'
 ],'Solo encuentras tu contenido académico permitido.',
 'No accedes a salud, documentos de identidad, pagos, conversaciones privadas, permisos de recojo ni confirmaciones obligatorias de tus padres. La cuenta no se obtiene usando el correo de mamá o papá.',
 photo=NEW+'estudiante-apk-campana.png',caption='Inicio de Mateo en APK: sus avisos académicos y accesos a tareas y agenda.')

page('estudiante-entregar','Estudiante','Entregar y corregir una tarea','Tareas y entregas > Abrir tarea',
 'Solo puedes entregar tu propio trabajo en una tarea publicada y autorizada.',[
 'Lee instrucciones, fecha límite y si admite entregas atrasadas. Comprueba la materia y el aula.',
 'Escribe tu respuesta. Si están habilitados los adjuntos, agrega los archivos permitidos y espera a que terminen de cargarse.',
 'Revisa texto y archivos y pulsa la acción de entrega. Verifica que cambió el estado; no cierres el formulario mientras no sepas el resultado.',
 'Consulta la revisión, comentarios y puntuación si corresponde. Una entrega revisada no se edita libremente.',
 'Si el docente la devuelve, corrige lo solicitado y vuelve a entregar la versión nueva. Consulta el estado después de guardar.'
 ],'Tu entrega y su revisión aparecen también para el docente autorizado.',
 'Se admiten hasta cinco PDF, JPG, PNG o WebP de 5 MB por entrega cuando la institución tiene archivos habilitados. Si una carga falla, conserva tu texto y revisa antes de reintentar.',
 photo=OLD+'c02-apk-revision-web.png',caption='APK: consulta de la revisión que realizó el docente desde la web.')

page('estudiante-avisos','Estudiante','Abrir avisos y planificar tu día','Campana > Comunicado | Agenda | Horarios / Materiales',
 'Tus notificaciones académicas llevan al contenido que tu cuenta puede consultar.',[
 'Abre la campana o Lo importante. Los avisos nuevos deben aparecer primero.',
 'Pulsa el comunicado y lee su contenido en Comunicados. No tienes que confirmar consentimientos de adultos.',
 'Consulta la agenda de tu aula y las actividades generales de tu institución; otra aula no debe mezclarse con la tuya.',
 'En Horarios consulta la publicación vigente, no los borradores de planificación. En Materiales revisa lo aprobado para tu curso.',
 'Si un enlace ya no corresponde a tu acceso, vuelve al inicio y pide ayuda; no cambies datos o uses otra cuenta para abrirlo.'
 ],'Puedes consultar los avisos y fechas del curso correcto sin acceder a datos familiares privados.',
 'Que llegue un aviso al teléfono depende de sus permisos Android. La cuenta estudiantil recibe lectura académica, no los recordatorios de confirmación obligatoria de mamá o papá.',
 photo=NEW+'estudiante-web-campana.png',caption='Web: avisos recientes de Dirección y docente en la campana del estudiante.')

page('secretaria-borrador','Secretaría académica','Preparar un horario','Horarios de clases > Preparar horario',
 'Dirección delega este acceso a un correo verificado. El rol no abre expedientes ni caja.',[
 'Selecciona la gestión y revisa las aulas, materias y docentes disponibles para planificar.',
 'Define jornada, días, duración de periodos, recreos e indisponibilidades según la configuración autorizada.',
 'Carga periodos semanales y bloques por materia/paralelo. No confundas periodos con horas de reloj.',
 'Genera una propuesta y revisa déficits, cruces o mensajes de búsqueda. Si no se encuentra solución, revisa los datos; no reduzcas cargas sin decisión responsable.',
 'Guarda el borrador y solicita la revisión de Dirección. Un borrador guardado todavía no se publica a las familias.'
 ],'La propuesta queda disponible como borrador dentro de la sede y gestión correctas.',
 'La planificación comprueba aula, docente, jornada, recreos y publicaciones existentes. No incorpora tiempos de viaje entre sedes. El algoritmo no modifica la jornada por su cuenta.',
 photo=FULL+'secretaria-web-borrador.png',caption='Web de Secretaría: versión identificada como borrador privado.')

page('secretaria-publicar','Secretaría académica','Revisar y publicar según delegación','Horarios de clases > Versiones / Revisión',
 'El permiso de preparar y el permiso de aprobar/publicar se administran por separado.',[
 'Revisa la versión, gestión, aulas y docentes antes de solicitar aprobación. Corrige el borrador cuando sea necesario.',
 'Si no aparece Publicar, entrega la propuesta a Dirección; no es un error de tu cuenta.',
 'Si Dirección te concedió expresamente aprobación/publicación, comprueba nuevamente las restricciones antes de confirmar.',
 'Para cambiar un horario publicado crea una copia, ajústala y sigue otra vez el proceso de revisión.',
 'Después de publicar, comprueba la versión vigente. Familias y estudiantes consultan solo la publicación de sus aulas.'
 ],'La versión aprobada sustituye a la anterior conservando el historial de planificación.',
 'Dirección puede retirar la delegación. Secretaría no recibe por este rol permisos sobre notas, datos médicos, cobros, banco o configuración general de la institución.',
 photo=FULL+'secretaria-apk16-inicio.png',caption='APK de Secretaría: sus versiones y la consulta de un horario publicado.')

page('plataforma-alta','Superadministración','Incorporar una institución','Panel de plataforma > Solicitudes / Instituciones / Solicitudes de demo',
 'Este capítulo es interno: corresponde al operador autorizado de MiCole, no a las cuentas de las instituciones.',[
 'Revisa solicitudes de alta o demostración y sus datos de contacto. Registra seguimiento y estado comercial sin inventar contactos atendidos.',
 'Verifica la institución y crea/activa su registro por el flujo de plataforma. Conserva la sede y su responsable correctamente identificados.',
 'Invita a Dirección con el correo autorizado y comprueba que acceda a su institución, no a la plataforma.',
 'Coordina identidad, niveles y habilitación del servicio. Una solicitud de demo no crea automáticamente una cuenta de Dirección.',
 'Comprueba la publicación pública solo si está habilitada y autorizada. Mantén pruebas persistentes separadas de la institución real.'
 ],'La institución tiene una Dirección vinculada y un estado de servicio claro.',
 'Superadministración no se elige libremente en el login. Los paneles institucionales no deben mostrar funciones globales de plataforma.',
 flow=['Solicitud y revisión','Institución y Dirección','Preparación y servicio'])

page('plataforma-credito','Superadministración','Crédito y facturación MiCole','Crédito MiCole | Facturación MiCole | Configuración > Tarifas',
 'La relación comercial con la institución se mantiene separada de los cobros que recibe por sus alumnos.',[
 'Revisa tarifas generales y acuerdos de cada institución. Los cambios requieren motivo y afectan las nuevas emisiones correspondientes.',
 'Comprueba adelanto, saldo y aplicación de licencias por periodo. Las tarifas mostradas y el contrato vigente son la referencia de cada cliente.',
 'La configuración actual contempla crédito inicial y licencias por estudiantes activos. Revisa si la activación por alumno está habilitada para ese acuerdo.',
 'Consulta cobros y liquidaciones MiCole por institución. Una captura o un recibo escolar manual no acredita automáticamente el crédito de plataforma.',
 'Verifica estados bancarios y discrepancias por el flujo autorizado. No edites saldos ni repitas liquidaciones para simular dinero recibido.'
 ],'Las licencias y el crédito coinciden con movimientos confirmados y tarifas revisadas.',
 'No se confunden cuenta bancaria de MiCole y cuenta de la institución. Cambiar tarifas no disminuye importes ya emitidos. La emisión fiscal continúa por el procedimiento externo disponible.',
 flow=['Acuerdo y tarifa','Emisión / crédito','Aplicación y revisión'])

page('plataforma-soporte','Superadministración','Soporte y pruebas con responsabilidad','Pruebas y soporte > Institución / Rol / Persona',
 'Una sesión de soporte conserva el alcance del rol y su institución, y los cambios pueden persistir.',[
 'Para un caso real selecciona institución, rol y persona autorizada; registra un motivo concreto y revisa la duración.',
 'Comprueba la barra de Soporte o Pruebas. Antes de guardar confirma dónde se conservará la operación.',
 'Para simulacros usa una institución marcada expresamente para pruebas y datos ficticios. No conviertas una institución real en laboratorio por comodidad.',
 'No confirmes lecturas o consentimientos en nombre de una familia. Las pruebas de permisos deben contrastarse además con cuentas normales independientes.',
 'Al terminar usa Volver a superadmin o cierra la sesión delegada. Revisa autoría e historial del caso.'
 ],'La ayuda queda delimitada y la identidad real de quien actuó conserva su trazabilidad.',
 'Soporte puede tener excepciones de acceso para revisar un caso; eso no demuestra el comportamiento de una cuenta familiar normal. Una prueba no debe convertirse en cobro, entrega o autorización real.',
 flow=['Motivo y alcance','Sesión delegada','Cerrar y auditar'])

page('plataforma-operar','Superadministración','Operar avisos e incidencias','Pruebas de notificaciones | Configuración | Historial',
 'El laboratorio privado ayuda a distinguir creación de avisos, entrega técnica y recepción en Android.',[
 'En el laboratorio elige escenario y Solo campanita o Campanita + mi teléfono Android. Selecciona un teléfono propio activo cuando corresponda.',
 'Revisa el envío de prueba y confirma. Comprueba historial, campana, Android y apertura del contenido por separado.',
 'Si Firebase aceptó el envío, no lo presentes aún como recepción física. Revisa permisos, categorías, canal y estado del dispositivo.',
 'Gestiona las conexiones y tarifas exclusivamente por sus formularios autorizados. No compartas capturas de claves ni credenciales con clientes.',
 'Ante un incidente registra fecha, rol, sede, versión, acción y resultado. Protege los datos sensibles y conserva evidencias mínimas del caso.'
 ],'La incidencia se puede reproducir y atender sin confundir un envío aceptado con una lectura.',
 'El laboratorio no es una emergencia real ni una factura, cobro o autorización real. Para producción siguen siendo necesarias las verificaciones operativas de respaldo, privacidad y proveedores del final de esta guía.',
 flow=['Aviso creado','Android lo muestra','Contenido abierto'])

page('ayuda-acceso','Solución de problemas','Si no puedes ingresar','Acceso / Perfil / Dirección de la institución',
 'Empieza por el contexto y por el mensaje exacto que aparece.',[
 'Sin vínculo o institución: comprueba el correo. Pide revisar invitación docente, correos familiares o acceso estudiantil habilitado.',
 'Contraseña incorrecta: revisa escritura y método de acceso. Usa enlace personal cuando esté habilitado; no crees otra cuenta para intentar heredar el rol.',
 'Enlace vencido o usado: solicita uno nuevo y abre el último. No lo compartas con otra persona.',
 'Rol o hijo ausente: verifica la asignación con Dirección. Un selector no concede un permiso que no existe.',
 'Pantalla de recuperación: pulsa Recargar MiCole. Si se repite, informa versión, ruta y acción previa; conserva una captura sin contraseñas ni enlaces personales.'
 ],'Puedes identificar si el problema es de credenciales, vínculo, configuración o carga de la página.',
 'Recargar o cerrar completamente una app puede perder borradores que solo están en memoria. Guarda el borrador en el servidor cuando el módulo lo permita antes de salir.',
 flow=['Leer el mensaje','Comprobar cuenta y vínculo','Reintentar o reportar'])

page('ayuda-red','Solución de problemas','Conexión, archivos y notificaciones','Formulario abierto / Campana / Configuración del teléfono',
 'No interpretes una respuesta incierta como una confirmación de que no se guardó.',[
 'Si falla la red, conserva el formulario. Restablece la conexión y revisa el resultado antes de crear otro pedido.',
 'Si hay un guardado pendiente de cuidados o inscripción, reabre el mismo pedido durante la sesión y usa su reintento.',
 'Archivo rechazado: comprueba tamaño, formato permitido y niño. Una carga aún en preparación no equivale a un adjunto guardado.',
 'Archivo sin abrir: vuelve a solicitarlo dentro de la app; los enlaces privados caducan. Si cambió tu permiso, consulta a Dirección.',
 'Aviso sin banner o sonido: comprueba permiso Android, categorías, canal, volumen, No molestar y ahorro de batería. Consulta también la campana de MiCole.'
 ],'Recuperas el flujo evitando duplicados o adjuntos que nunca terminaron de guardarse.',
 'Los borradores en memoria no son una cola de trabajo sin internet y no sobreviven a todos los cierres o recargas. No hay cobros ni marcaciones GPS automáticas sin conexión.',
 photo=FULL+'apk16-sin-red-mensaje-claro.png',caption='APK: un error de conexión conserva los datos y permite revisar el reintento.')

page('ayuda-contexto','Solución de problemas','GPS, saldos y cambios simultáneos','Asistencia del equipo | Estado de cuenta | Actualizar datos',
 'La respuesta del servidor y la revisión de Dirección determinan el resultado.',[
 'GPS fuera de rango o impreciso: revisa permiso, ubicación y sede. Vuelve a verificar; si persiste, solicita revisión de Dirección con motivo.',
 'Entrada no habilitada: comprueba que el control esté activo, tu turno asignado y la lectura reciente. No cambies la hora del teléfono para forzar una marcación.',
 'Saldo sin actualizar: revisa recibo, comprobante y estado bancario. Informar o pagar fuera de la app puede requerir confirmación.',
 'Dato modificado por otra persona: actualiza y compara antes de guardar. Una revisión desactualizada no debe sobrescribir silenciosamente el trabajo ajeno.',
 'Registro del hijo o aula incorrectos: deja de escribir, revisa selectores y reporta el caso. Adjunta solo evidencia mínima de los datos ficticios o autorizados.'
 ],'El personal puede distinguir configuración, datos pendientes y una incidencia real.',
 'No registres un pago ficticio, una segunda asistencia ni una autorización nueva para ocultar un error. Conserva el identificador o referencia visible y el contexto para soporte.',
 flow=['Contexto correcto','Estado confirmado','Corrección con motivo'])

page('piloto','Piloto de la institución','Plan de 5 a 10 días','Responsable: Dirección con docentes y familias participantes',
 'Haz el piloto con personas que usarán MiCole, incluyendo dos hermanos y otra familia de un aula distinta.',[
 'Preparación: comprueba institución, aulas, correos, vínculos, teléfonos, versión APK y permisos. Define un canal para reportar problemas.',
 'Primeros días: cada persona entra sin ayuda, ubica su inicio y pasa una jornada de asistencia, cuidados y cuaderno.',
 'Comunicación: Dirección y docentes publican avisos de aula y de un niño. Mamá y papá abren y confirman por separado; el estudiante recibe solo lo académico.',
 'Operación: prueba permisos, recojos siguiendo el procedimiento presencial, entrevistas y una ficha nueva. Revisa el resultado en la otra plataforma.',
 'Cierre: registra dónde necesitaron ayuda, errores, duplicados y tiempos de atención. Repite los casos corregidos y acuerda el procedimiento diario.'
 ],'La institución completa su jornada y conoce cómo pedir ayuda ante una excepción.',
 'No confundas los pagos ficticios y documentos sintéticos del entrenamiento con dinero o identidad reales. Para probar una operación real debes coordinarla expresamente con su responsable.',
 flow=['Preparar personas','Usar una jornada real','Corregir y repetir'])

page('salida-venta','Piloto de la institución','Comprobaciones antes de vender','Responsable: operador de MiCole y Dirección piloto',
 'El manual ayuda a capacitar; no declara por sí mismo que la plataforma esté lista para todos los clientes.',[
 'Privacidad: mantener las restricciones de campos privados y los clientes compatibles. Esta edición cerró la compatibilidad antigua y verificó de nuevo las cuentas normales.',
 'Respaldo: restaurar base y archivos en un entorno separado y comprobar registros, relaciones, documentos y permisos, no solo que existe una copia.',
 'Banco: si se ofrece QR automático, hacer el primer cobro controlado con el titular, revisar abono, recibo, conciliación, duplicados y errores.',
 'Dispositivos y cambios de versión: probar otras marcas Android, sonido, batería, reinicio, permisos y pestañas que permanecen abiertas durante una actualización.',
 'Operación: definir responsable de soporte, altas/bajas, actualización de APK, tratamiento de archivos e incidentes. Cerrar los problemas que afecten acceso o registros.'
 ],'La decisión comercial se basa en evidencias de funcionamiento y en responsables definidos.',
 'La privacidad quedó comprobada con trece cuentas y 49 controles. La APK 17 incorporó la asistencia exclusiva del docente; la APK 18 agrega lectura explícita y avisos importantes de salud, recojo y pagos desde cinco días antes del vencimiento. Los respaldos, el banco y otros dispositivos requieren todavía sus comprobaciones específicas.',
 flow=['Cerrar pendientes técnicos','Completar piloto','Autorizar salida comercial'])

# Hoja imprimible junto al plan de piloto; los números del PDF se calculan al generar.
pilot_index=next(i for i,p in enumerate(PAGES) if p['key']=='salida-venta')
PAGES.insert(pilot_index,dict(key='lista-piloto',chapter='Piloto de la institución',title='Lista de comprobación del piloto',route='',lead='Marca cada circuito después de contrastar web, APK y el resultado de la otra persona.',steps=[],result='',note='',photo=None,caption='',kind='pilot',flow=[]))

page('glosario','Consulta rápida','Conceptos que conviene distinguir',kind='glossary',lead='Usa estas diferencias para interpretar los estados y explicar el proceso a otras personas.')
page('referencias','Consulta rápida','Versión, imágenes y alcance',kind='sources',lead='Edición de uso operativo para web y APK Android, con foco en kínderes y guarderías.')
