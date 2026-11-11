#!/usr/bin/env python3
"""Cuaderno imprimible del piloto humano. No ejecuta pruebas ni modifica MiCole."""
from pathlib import Path
from xml.sax.saxutils import escape
import importlib.util, json, re, hashlib
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, white
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from fontTools.ttLib import TTFont as FontFile

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('pilot_content',ROOT/'docs/piloto/contenido.py')
data=importlib.util.module_from_spec(spec);spec.loader.exec_module(data)
OUT=ROOT/'output/pdf/MiCole-Guia-Piloto-Humano-Web-Android.pdf'
TMP=ROOT/'tmp/pdfs/piloto'
OUT.parent.mkdir(parents=True,exist_ok=True);(TMP/'fonts').mkdir(parents=True,exist_ok=True)
for family,weight,name in [('inter',400,'Inter'),('inter',600,'InterSemi'),('inter',700,'InterBold'),('poppins',700,'PoppinsBold')]:
    dst=TMP/'fonts'/f'{name}.ttf'
    if not dst.exists():
        f=FontFile(ROOT/f'node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff');f.flavor=None;f.save(dst)
    pdfmetrics.registerFont(TTFont(name,str(dst)))
pdfmetrics.registerFontFamily('Inter',normal='Inter',bold='InterBold',italic='Inter',boldItalic='InterBold')
W,H=A4;M=43;CW=W-2*M;BOTTOM=61
BLUE=HexColor('#3D6EF7');INK=HexColor('#263238');MUTED=HexColor('#57677B');LINE=HexColor('#DAE3EF');LIGHT=HexColor('#EDF2FF');BG=HexColor('#F7F9FD');GREEN=HexColor('#167557');AMBER=HexColor('#97601B')
AUDIT=[]
ALL=[case for _,_,cases in data.CASE_GROUPS for case in cases]
assert len(ALL)==48

def rich(text):
    text=escape(str(text)).replace('\n','<br/>')
    return re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',text)

def para(text,width,size=9.5,leading=None,color=INK,font='Inter'):
    p=Paragraph(rich(text),ParagraphStyle('p',fontName=font,fontSize=size,leading=leading or size*1.4,textColor=color,allowWidows=0,allowOrphans=0))
    _,height=p.wrap(width,2500)
    return p,height

def text(c,value,x,y,width=CW,size=9.5,leading=None,color=INK,font='Inter',minimum=BOTTOM):
    p,height=para(value,width,size,leading,color,font)
    if y-height<minimum:raise ValueError(f'Page {c.getPageNumber()} overflow {y-height:.1f}: {str(value)[:80]}')
    p.drawOn(c,x,y-height)
    AUDIT.append({'page':c.getPageNumber(),'kind':'text','top':round(y,2),'bottom':round(y-height,2),'size':size,'preview':str(value)[:80]})
    return y-height

def section(c,title,y):
    return text(c,title,M,y,size=12,font='InterBold',leading=16)-10

def note(c,label,value,y,color=BLUE):
    p,ph=para(value,CW-26,9.3,13.3)
    height=ph+44
    if y-height<BOTTOM:raise ValueError(f'Note overflow p{c.getPageNumber()} {label}')
    c.setFillColor(LIGHT if color==BLUE else HexColor('#EDF7F2'));c.roundRect(M,y-height,CW,height,8,fill=1,stroke=0)
    c.setFillColor(color);c.setFont('InterBold',8.1);c.drawString(M+13,y-17,label.upper());p.drawOn(c,M+13,y-height+12)
    return y-height-15

def table(c,rows,widths,y,size=8.6,pad=7,links=None):
    converted=[]
    for i,row in enumerate(rows):
        converted.append([para(v,widths[j]-pad*2,size,size*1.35,white if i==0 else INK,'InterBold' if i==0 else 'Inter')[0] for j,v in enumerate(row)])
    t=Table(converted,colWidths=widths,hAlign='LEFT')
    t.setStyle(TableStyle([('BACKGROUND',(0,0),(-1,0),BLUE),('ROWBACKGROUNDS',(0,1),(-1,-1),[white,BG]),('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),pad),('RIGHTPADDING',(0,0),(-1,-1),pad),('TOPPADDING',(0,0),(-1,-1),pad),('BOTTOMPADDING',(0,0),(-1,-1),pad),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]))
    _,height=t.wrap(CW,2500)
    if y-height<BOTTOM:raise ValueError(f'Table overflow p{c.getPageNumber()} {y-height:.1f}')
    t.drawOn(c,M,y-height)
    if links:
        cy=y
        for row,rh in enumerate(t._rowHeights):
            if row in links:c.linkRect('',links[row],(M,cy-rh,M+CW,cy),relative=0,thickness=0)
            cy-=rh
    AUDIT.append({'page':c.getPageNumber(),'kind':'table','bottom':round(y-height,2),'rows':len(rows),'size':size})
    return y-height-15

def line(c,y,label='',width=CW):
    if label:y=text(c,label,M,y,width,size=9.2,font='InterSemi')-11
    c.setStrokeColor(LINE);c.line(M,y,M+width,y)
    return y-23

def checkbox(c,label,x,y,size=8.6):
    c.setStrokeColor(MUTED);c.setLineWidth(.65);c.rect(x,y-7,7,7,fill=0,stroke=1)
    c.setFillColor(INK);c.setFont('Inter',size);c.drawString(x+11,y-6,label)

PAGES=[]
def add(key,title,chapter,kind,lead='',payload=None):PAGES.append(dict(key=key,title=title,chapter=chapter,kind=kind,lead=lead,payload=payload))
add('portada','Guía del piloto humano','MiCole','cover')
add('indice','Cómo ejecutar y registrar el piloto','Preparación','intro')
add('plan','Plan sugerido de 5 a 10 días','Preparación','plan','Ajusta las fechas al calendario del kínder. El periodo termina cuando se revisan los resultados, no al agotarse los días.')
add('preparar','Antes de empezar','Preparación','prepare','El coordinador prepara los datos. Las personas del piloto realizan las tareas y describen lo que entienden.')
add('cuentas','Participantes y cuentas de entrenamiento','Preparación','accounts','Estas cuentas ya existen para demostraciones QA. Para el piloto humano, cada adulto debe tener su propia cuenta y rol.')
add('avisos','Quién debe recibir cada aviso','Preparación','routing','Usa esta matriz junto a C19-C24. Revisa también a una persona excluida, no solo al destinatario esperado.')
for title,lead,cases in data.CASE_GROUPS:add(cases[0][0].lower(),title,'Casos de prueba','cases',lead,cases)
add('dispositivos','Matriz de dispositivos y condiciones','Ejecución humana','devices','Un resultado en un teléfono no confirma que funcione en todos los modelos. APK y navegador móvil son pruebas distintas.')
add('jornada','Ensayo de un día real','Ejecución humana','journey','Guion propuesto con datos ficticios. Las horas son de ejemplo; usa el turno real configurado para el ensayo laboral.')
add('semana','Seguimiento durante la semana','Ejecución humana','week','No cambies el reloj del teléfono para fingir vencimientos, horarios o cambios de día. Programa los ejemplos en las fechas acordadas.')
add('externos','Comprobaciones coordinadas pendientes','Antes de vender','external','Son controles operativos distintos de las pruebas automáticas. El responsable debe aportar evidencia, no solo decir «está configurado».')
add('resultados1','Registro maestro: C01 a C24','Hojas de trabajo','score',payload=ALL[:24])
add('resultados2','Registro maestro: C25 a C48','Hojas de trabajo','score',payload=ALL[24:])
add('incidencias','Cómo registrar un fallo útil','Hojas de trabajo','issue_example','Un buen reporte permite reproducir el problema con la misma cuenta, versión, fecha y pasos.')
add('hoja-incidencia','Ficha de incidencia para completar','Hojas de trabajo','issue_blank','Duplica o imprime esta página para cada hallazgo. No anotes contraseñas ni documentos reales de alumnos.')
add('personas','Evaluar si las personas lo entienden','Hojas de trabajo','survey','Observar sin guiar es parte de la prueba. Si hubo ayuda, se anota aunque el resultado final sea correcto.')
add('decision','Decisión al terminar el piloto','Antes de vender','decision','La evidencia automatizada ayuda; no reemplaza este recorrido humano, la recuperación de respaldo ni las condiciones reales de Android.')
add('acciones','Pendientes, responsables y referencias','Cierre','actions','Conserva este cuaderno con la fecha y versiones revisadas. Al corregir un fallo, repite su circuito en web y APK cuando corresponda.')
NUM={p['key']:i+1 for i,p in enumerate(PAGES)}
assert len(PAGES)==33

def base(c,p,i):
    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(BLUE);c.rect(0,H-7,W,7,fill=1,stroke=0)
    c.setFillColor(MUTED);c.setFont('InterSemi',7.7);c.drawString(M,H-30,'MICOLE / PILOTO HUMANO');c.drawRightString(W-M,H-30,p['chapter'].upper())
    c.bookmarkPage(p['key'])
    first=i==0 or PAGES[i-1]['chapter']!=p['chapter']
    c.addOutlineEntry(p['chapter'] if first else p['title'],p['key'],level=0 if first else 1,closed=False)
    c.setStrokeColor(LINE);c.line(M,46,W-M,46)
    c.setFillColor(MUTED);c.setFont('Inter',7.2);c.drawString(M,31,'Edición '+data.VERSION+' | Web + APK Android | '+data.DATE)
    c.drawRightString(W-M,31,f'{i+1} / {len(PAGES)}')
    c.setFillColor(BLUE);c.drawCentredString(W/2,17,'Volver al índice');c.linkRect('','indice',(W/2-36,11,W/2+36,25),relative=0,thickness=0)
    y=text(c,p['title'],M,H-61,size=22,leading=27,font='PoppinsBold')-13
    if p['lead']:y=text(c,p['lead'],M,y,size=9.7,leading=14,color=MUTED)-16
    return y

def cover(c,p,i):
    c.bookmarkPage('portada');c.addOutlineEntry('MiCole: piloto humano','portada',level=0)
    c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(BLUE);c.rect(0,H-210,W,210,fill=1,stroke=0)
    c.setFillColor(HexColor('#54D2A0'));c.circle(W-10,H-168,92,fill=1,stroke=0)
    c.setFillColor(HexColor('#FFC857'));c.circle(W-92,H-72,29,fill=1,stroke=0)
    c.setFillColor(white);c.roundRect(M,H-145,280,94,12,fill=1,stroke=0)
    lx=M+17;ly=H-139;scale=246/1386;lh=479*scale
    c.saveState();clip=c.beginPath();clip.rect(lx,ly,246,lh);c.clipPath(clip,stroke=0,fill=0)
    c.drawImage(str(ROOT/'public/brand/logo-horizontal.png'),lx-48*scale,ly-(1086-288-479)*scale,width=1448*scale,height=1086*scale,mask='auto');c.restoreState()
    y=text(c,'Guía del\npiloto humano',M,H-247,size=36,leading=43,font='PoppinsBold')-18
    y=text(c,'Web + APK Android',M,y,size=19,leading=25,font='InterBold',color=BLUE)-18
    y=text(c,'Qué revisar, cómo probarlo y con qué evidencia decidir si MiCole está listo para tus primeros kínderes.',M,y,size=12.8,leading=19,color=MUTED)-25
    rows=[['48 casos concretos','6 roles','33 páginas'],['Pasos y ejemplos','Resultados esperados','Hojas imprimibles']]
    for j,row in enumerate(rows):
        width=(CW-16)/3
        for k,label in enumerate(row):
            x=M+k*(width+8);cy=y-j*42;c.setFillColor(white);c.setStrokeColor(LINE);c.roundRect(x,cy-31,width,33,7,fill=1,stroke=1);text(c,label,x+10,cy-7,width-20,size=8.8,leading=12,font='InterSemi')
    y-=105
    y=note(c,'Cuaderno de ejecución','Todos los resultados empiezan pendientes. Estos ejemplos describen qué comprobar; no certifican que el piloto ya se haya realizado.',y)
    y=text(c,'Institución: __________________________________________',M,y,size=10.3,leading=16)-15
    text(c,'Responsable: __________________  Fechas: _______________',M,y,size=10.3,leading=16)
    c.setStrokeColor(LINE);c.line(M,94,W-M,94);c.setFillColor(MUTED);c.setFont('Inter',8.2);c.drawString(M,75,'Edición '+data.VERSION+' | '+data.DATE);c.drawString(M,59,'Base de referencia: web publicada y APK 19. Registrar versión usada en cada sesión.')

def intro(c,p,i):
    y=base(c,p,i)
    y=note(c,'Dos preguntas distintas','1. ¿La operación guarda y muestra el resultado correcto? 2. ¿Una persona nueva sabe hacerla y entenderla sin ayuda? Hay que registrar ambas.',y)
    rows=[['Bloque','Páginas'],['Plan, preparación y cuentas',f'{NUM["plan"]}-{NUM["avisos"]}'],['48 escenarios por rol y circuito',f'{NUM["c01"]}-{NUM["c46"]}'],['Dispositivos, jornada y seguimiento',f'{NUM["dispositivos"]}-{NUM["semana"]}'],['Respaldo, banco y acceso real',str(NUM['externos'])],['Resultados, incidencias y experiencia',f'{NUM["resultados1"]}-{NUM["personas"]}'],['Decisión y acciones',f'{NUM["decision"]}-{NUM["acciones"]}']]
    y=table(c,rows,[CW-100,100],y,size=9.1,links={1:'plan',2:'c01',3:'dispositivos',4:'externos',5:'resultados1',6:'decision'})
    y=section(c,'Cómo marcar un resultado',y)
    for item in ['**OK:** una persona ejecutó el caso y se contrastó el resultado en el otro canal o cuenta que corresponde.', '**F:** fallo reproducido o resultado incorrecto. Abrir ficha de incidencia con evidencia.', '**NA:** no aplica, con motivo escrito. Por ejemplo, C46 en la APK es NA: se prueba en web móvil y escritorio.', '**En blanco:** pendiente. No significa aprobado. Las casillas de cada caso permiten web y Android por separado.']:
        y=text(c,item,M,y,size=9.4,leading=13.4)-8
    note(c,'Formato cruzado','Web -> APK significa crear o cambiar en web y comprobar en Android. APK -> web invierte el recorrido. Repite los casos críticos en ambos sentidos cuando la función exista en los dos.',y)

def plan(c,p,i):
    y=base(c,p,i)
    y=table(c,[['Cuándo','Quién coordina','Qué se observa']]+data.SCHEDULE,[75,113,CW-188],y,size=9,pad=8)
    y=section(c,'Equipo mínimo sugerido',y)
    y=text(c,'Un coordinador de MiCole, una persona de Dirección, dos docentes de aulas distintas, mamá y papá de los mismos hijos, otra familia y un contacto de otra institución QA. Agrega Secretaría, propietario y estudiante si se usan esos roles.',M,y,size=9.6,leading=14)-15
    y=note(c,'Sesiones cortas y sin guiar','Reserva 30-45 minutos por grupo para los casos asignados y observa el uso cotidiano entre sesiones. El observador lee los pasos; la persona recibe primero solo la tarea.',y)
    y=section(c,'Acuerdos antes de probar',y)
    for label in ['Coordinador y contacto de apoyo:','Dirección participante y contacto:','Fecha de revisión de hallazgos:','Canal y tiempo acordado para reportar una urgencia operativa:']:
        y=line(c,y,label)

def prepare(c,p,i):
    y=base(c,p,i)
    items=[
    ('Versiones','Anota fecha, URL pública, navegador y versión Android/APK. La base de esta guía es APK 19; no pruebes una APK antigua sin dejarlo escrito.'),
    ('Datos de entrenamiento','Prepara dos aulas, dos docentes, dos hijos de la misma familia, otra familia y otra sede QA. Identifica cada dato como PILOTO o SIMULADO.'),
    ('Pagos de ejemplo','Objetivo: una cuota ficticia total Bs 350, dos abonos de 100 y 250, fechas D+5 y D+6. Verifica el desglose configurado; si el total es otro, anótalo y adapta la cuenta.'),
    ('Documentos','Usa archivos y tarjetas SIMULADO, sin números reales ni fotos de niños. Prepara un archivo admitido y otro rechazable para comprobar los errores.'),
    ('Personal','Dirección registra turno, radio GPS, tolerancia y regla de descuentos. Los casos históricos de boleta usan QA y mes terminado; no se cambia el reloj.'),
    ('Receptores','Acuerda quién recibirá cada aviso y quién debe quedar excluido. Mantén abiertas dos sesiones para contrastar cambios.'),
    ('Personas reales del piloto','Invita a cada adulto con su correo propio y rol mínimo. Entrega el acceso por el canal privado acordado. No compartas una cuenta entre participantes reales.'),
    ]
    for title,value in items:
        y=text(c,'**'+title+'.** '+value,M,y,size=9.5,leading=13.5)-12
    note(c,'Para empezar en tus datos actuales','Los tres colegios existentes al preparar esta guía estaban marcados como pruebas. En las métricas usa Solo pruebas. No cambies esas etiquetas para aparentar operación real.',y)

def accounts(c,p,i):
    y=base(c,p,i)
    y=table(c,[['Rol QA','Correo','Contexto']]+data.ACCOUNTS,[80,218,CW-298],y,size=8.05,pad=6)
    y=note(c,'Acceso separado del propietario','Superadministración usa la cuenta privada del propietario. No se agrega una cuenta compartida de superadmin a esta lista. El caso C43 debe ejecutarse con esa sesión real en web y APK.',y)
    text(c,'No se publican contraseñas. Los correos .test no reciben correo real: no sirven para probar entrega de invitaciones o recuperación por email. En kínder, el rol Estudiante puede ser NA si no se ofrece; no crees una cuenta infantil solo para aprobar una casilla.',M,y,size=9.2,leading=13)

def routing(c,p,i):
    y=base(c,p,i)
    y=table(c,[['Origen / contenido','Destinatarios esperados','Deben quedar excluidos']]+data.NOTIFICATION_MATRIX,[161,174,CW-335],y,size=8.7,pad=7)
    y=section(c,'Distingue estas cuatro evidencias',y)
    for value in ['**Envío:** se generó el aviso para el público correcto.', '**Recepción:** la persona lo ve en su campana o en Android; anota canal y hora.', '**Apertura:** al pulsarlo se abre exactamente el hijo y contenido esperado.', '**Lectura o confirmación:** la persona realiza la acción expresa. Abrir o recibir no equivale a confirmar.']:
        y=text(c,value,M,y,size=9.4,leading=13.2)-9
    note(c,'Web y Android no se califican igual','En web comprueba la campana y el aviso al entrar. La recepción fuera de la app se comprueba en Android; no des por habilitadas notificaciones de escritorio del navegador si esa función no se ofrece.',y)

def case_card(c,case,y):
    code,priority,title,actors,channel,prepare_value,steps,expected=case
    x=M+12;width=CW-24
    title_p,title_h=para(code+' | '+title,width,12.2,16,'#263238','InterBold')
    meta=f'{priority.upper()}  /  {actors}  /  {channel}'
    meta_p,meta_h=para(meta,width,8.3,11.4,BLUE,'InterSemi')
    body=[]
    for label,value in [('Prepara',prepare_value),('Haz la prueba',steps),('Debe pasar',expected)]:
        pp,hh=para('**'+label+':** '+value,width,10,13.8)
        body.append((pp,hh))
    height=12+title_h+5+meta_h+9+sum(hh+6 for _,hh in body)+37
    if y-height<BOTTOM:raise ValueError(f'Case overflow page {c.getPageNumber()}: {code} bottom {y-height:.1f}')
    c.setFillColor(white);c.setStrokeColor(LINE);c.setLineWidth(.65);c.roundRect(M,y-height,CW,height,8,fill=1,stroke=1)
    cy=y-12;title_p.drawOn(c,x,cy-title_h);cy-=title_h+5;meta_p.drawOn(c,x,cy-meta_h);cy-=meta_h+9
    for pp,hh in body:pp.drawOn(c,x,cy-hh);cy-=hh+6
    c.setFont('InterSemi',8.1);c.setFillColor(INK);c.drawString(x,cy-7,'Web:')
    for label,offset in [('OK',34),('F',71),('NA',101)]:checkbox(c,label,x+offset,cy-1,8.0)
    c.drawString(x+168,cy-7,'APK:')
    for label,offset in [('OK',202),('F',239),('NA',269)]:checkbox(c,label,x+offset,cy-1,8.0)
    c.setFont('Inter',7.8);c.setFillColor(MUTED);c.drawString(x,cy-25,'Fecha / persona / incidencia o motivo NA: ______________________________________________')
    AUDIT.append({'page':c.getPageNumber(),'kind':'case','id':code,'bottom':round(y-height,2),'size':10})
    return y-height-11

def cases(c,p,i):
    y=base(c,p,i)
    for case in p['payload']:y=case_card(c,case,y)

def devices(c,p,i):
    y=base(c,p,i)
    rows=[['Equipo / canal','Configuración que hay que anotar'],['PC Windows: Chrome o Edge','Versión, tamaño de pantalla, zoom, conexión y lector PDF si se usa.'],['Mac o equipo habitual de Dirección','Navegador ofrecido a ese colegio; comprobar archivos, impresión y teclado.'],['Android 1: APK','Modelo actual; versión Android y APK; red, batería y permisos.'],['Android 2: APK','Otra marca, preferiblemente un equipo económico; mismas pruebas críticas.'],['Android 3: APK si está disponible','Android más reciente o una configuración distinta a los anteriores.'],['Chrome Android: web','La web del teléfono se prueba aunque la APK funcione. No reutilizar su casilla.']]
    y=table(c,rows,[180,CW-180],y,size=9.1)
    y=section(c,'Repite estas condiciones de Android',y)
    y=table(c,[['Condición','Qué registrar'],['Pantalla bloqueada + app en segundo plano','Aviso visible, tiempo, sonido y apertura: C22-C23.'],['Retirada de recientes + reinicio del teléfono','Espera a recuperar red, desbloquea y comprueba recepción y apertura. No confundir con Forzar detención.'],['Wi-Fi, datos móviles y recuperación de red','Resultado antes y después; si no hay datos móviles disponibles, dejar pendiente.'],['Ahorro de batería / permiso desactivado','Condición exacta y recuperación; no atribuir el silencio a un envío que nunca se comprobó.'],['Texto ampliado, teclado y archivo grande admitido','Botones visibles, desplazamiento, campos no tapados y mensajes legibles.']],[180,CW-180],y,size=8.8)
    y=line(c,y,'Equipo / Android / APK / navegador / fecha:')
    text(c,'Conserva una copia de la matriz de resultados por combinación importante de equipo y versión. No cambies ajustes personales sin acuerdo del participante; al acabar, devuelve los ajustes usados en el ensayo.',M,y,size=9.1,leading=13)

def journey(c,p,i):
    y=base(c,p,i)
    rows=[['Momento de ejemplo','Acción humana y contraste'],['Antes de la jornada','Mamá pide permiso para Mateo. Dirección consulta; el docente abre lista y ve el pedido antes de marcar. C07.'],['07:30 - llegada del equipo','Docente marca entrada con GPS real. Dirección ve la marca desde la web. C10-C12.'],['08:00 - recepción de alumnos','Docente acepta o rechaza el permiso, registra estados y confirma. Mamá y papá verifican en sus sesiones. C08.'],['10:00 - rutina del aula','Registra un cuidado grupal para dos niños con detalles diferentes, excluyendo a un tercero. Familias contrastan. C16-C17.'],['11:00 - comunicación','Dirección publica un aviso académico. Docente envía otro. Familia lo recibe con APK fuera de primer plano y confirma por separado. C19-C23.'],['12:00 - pago de entrenamiento','Con cuota ficticia de 350, mamá lee; Dirección registra 100. Papá ve saldo 250. Después se salda y se retira el aviso. C25-C27.'],['Hora acordada - recojo','Se ensaya persona autorizada y persona con autorización de otro niño. El personal comprueba documento y decisión. C28-C30.'],['Fin del turno','Docente marca salida; Dirección revisa la jornada. Un propietario consulta las métricas QA y compara con los registros. C10 y C43-C45.']]
    y=table(c,rows,[133,CW-133],y,size=9,pad=8)
    y=note(c,'Qué debe registrar el observador','En cada paso: persona, hora, canal de origen, canal receptor, resultado real, ayuda necesaria e incidencia. Marca C01-C48 después del contraste, no por haber leído este guion.',y)
    line(c,y,'Principal dificultad del día / responsable de resolverla:')

def week(c,p,i):
    y=base(c,p,i)
    rows=[['Seguimiento','Ejemplo y criterio'],['Siguiente entrada a la app','Un aviso todavía pendiente debe seguir disponible. Uno leído no se atribuye al otro padre. Un saldo cambiado debe revisarse con su importe actual.'],['Vencimiento D+5 y D+6','El coordinador crea ejemplos con fechas reales futuras. Revisa de nuevo cuando cambie el día. Un saldo pendiente puede avisarse de nuevo al día siguiente según el recordatorio.'],['Cambio de semana / mes','Compara los filtros con fechas de Bolivia. Las semanas parciales y cuotas con vencimiento en otro mes se interpretan según el rango, no como pérdida de datos.'],['Curso y horario habituales','Repite la asistencia con el docente que realmente estará a cargo. Confirma que la agenda y los permisos anticipados encajan con su rutina.'],['Boleta del periodo terminado','Revisar tardanzas, salidas faltantes, ajustes con motivo y aprobación. El sueldo mensual sin marca no descuenta una ausencia automáticamente.'],['Cada corrección','Repite el caso fallido con ambos canales y destinatarios originales. Anota versión corregida y evidencia de repetición.'],['Cierre diario del coordinador','Revisa incidentes nuevos, datos de entrenamiento que generan alertas y tareas que las personas no pudieron completar sin ayuda.']]
    y=table(c,rows,[143,CW-143],y,size=9,pad=8)
    y=section(c,'Limpieza de ejemplos, sin borrar evidencia',y)
    y=text(c,'Retira los comunicados de demostración que ya no deban bloquear el inicio mediante su flujo normal; conserva el historial. Identifica recibos y documentos como ficticios. No borres una evidencia para ocultar un fallo ni modifiques registros de otra institución.',M,y,size=9.6,leading=14)-14
    note(c,'Hallazgos que merecen repetición','Las tandas previas detectaron recuperación transitoria de acceso al cambiar cuentas y una carga web fallida al volver a una pestaña. No se da por cerrado su comportamiento en todas las condiciones: repetir C42 con personas y equipos del piloto.',y)

def external(c,p,i):
    y=base(c,p,i)
    for title,body in [
    ('1. Recuperación completa de respaldo','Responsable técnico, con Dirección como observador. Restaurar base y archivos en un entorno separado; evitar envíos o cobros desde la copia. Contrastar cantidades, relaciones, un documento que realmente abra, una cuota con sus abonos y permisos de acceso de dos familias. Registrar fecha del respaldo, tiempo de recuperación y evidencia. Tener una copia existente no equivale a haber restaurado.'),
    ('2. Cobro bancario real, si se ofrece QR automático','Responsable de MiCole, Dirección y proveedor coordinan antes un cobro pequeño, importe y cuenta de destino autorizados. Observar confirmación del proveedor, recibo único, saldo y conciliación bancaria. Un comprobante cargado o un estado pendiente no demuestra ingreso confirmado. Si no se ofrece QR automático, NA con explicación; el cobro manual debe ser claro.'),
    ('3. Invitación y recuperación por correo real','Usar adultos participantes y correos propios acordados, no las direcciones .test. Revisar recepción, spam, caducidad, acceso al rol correcto y recuperación sin conceder otros roles. Comprobar el correo de soporte mostrado a las personas.'),
    ('4. Sesión real de Superadministración y más Android','El propietario realiza C43-C45 en web y APK con su cuenta. La prueba previa de interfaz de métricas fue local con respuestas simuladas y su agregación se verificó en base; este recorrido humano positivo sigue siendo necesario. Repetir notificaciones y apertura en otra marca Android.'),
    ]:
        y=section(c,title,y);y=text(c,body,M,y,size=9.5,leading=13.6)-18
    note(c,'Cierre verificable','Cada control lleva responsable, fecha, evidencia y resultado. Una comprobación técnica pendiente no se marca OK por completar los casos de uso cotidiano. No se restaura ni se provoca una incidencia sobre producción para ensayar.',y)

def score(c,p,i):
    y=base(c,p,i)
    y=text(c,'Sede: __________________  Fecha: __________  Versión APK: ________',M,y,size=9.2,leading=14)-9
    y=text(c,'Equipo / navegador: __________________  Observador: ______________',M,y,size=9.2,leading=14)-14
    rows=[['Caso / prioridad','Prueba','Web','APK','Cruce / incidencia']]
    for case in p['payload']:
        code,priority,title,*_=case
        rows.append([code+' / '+('C' if priority=='Crítica' else 'A'),title,'_____','_____','____________'])
    y=table(c,rows,[72,219,39,39,CW-369],y,size=8.4,pad=5)
    y=text(c,'C = crítica; A = alta. Resultado: OK, F o NA. En blanco = pendiente. Cruce = origen y receptor contrastados; anota referencia de incidencia o motivo de NA.',M,y,size=8.8,leading=12.5)-12
    line(c,y,'Casos que hay que repetir / responsable / fecha:')

def issue_example(c,p,i):
    y=base(c,p,i)
    y=table(c,[['Nivel','Ejemplo y actuación'],['Crítica','Otra familia lee un documento; se duplica un cobro; se autoriza un recojo equivocado. Detener ese circuito, limitar el alcance y escalar.'],['Alta','No llega un aviso importante en la condición acordada; una lista confirmada no aparece; no se puede terminar un flujo esencial. Resolver y repetir antes de ampliar.'],['Media','El flujo se completa con ayuda, un error tiene texto confuso o falta una indicación. Asignar mejora y observar si impide el uso real.'],['Baja','Detalle visual sin pérdida de función o comprensión. Registrar y priorizar sin ocultarlo.']],[76,CW-76],y,size=9,pad=7)
    y=note(c,'Ejemplo inventado de reporte','No describe un fallo actual confirmado de MiCole. Sirve para mostrar el nivel de detalle que necesita el equipo.',y)
    sample=[('ID / caso','PIL-007 / C27'),('Condiciones','APK 19, modelo y Android anotados, cuenta mamá QA, red Wi-Fi; Dirección opera desde Chrome.'),('Pasos','1) Cuota 350. 2) Abono 100 y familia ve 250. 3) Dirección abona 250. 4) Familia vuelve al aviso abierto.'),('Esperado','Saldo 0 y aviso retirado sin marcarlo como leído.'),('Observado ficticio','El saldo muestra 0, pero el aviso continúa mostrando 250 durante cinco minutos después de volver a la app.'),('Evidencia y repetición','Hora de los dos abonos, referencias de recibos QA y captura del aviso. Repetido 2/2. Sin contraseña ni documento real.'),('Seguimiento','Responsable: ______. Versión corregida: ______. Repetición en web y APK: ______.')]
    table(c,[['Campo','Ejemplo']]+sample,[112,CW-112],y,size=9,pad=7)

def issue_blank(c,p,i):
    y=base(c,p,i)
    for label in ['ID de incidencia / caso C__ / fecha y hora:', 'Institución QA / rol / referencia del alumno ficticio:', 'Canal, equipo, Android, APK o navegador y red:', 'Condición previa: saldo, estado, permisos, turno o versión abierta:']:
        y=line(c,y,label)
    y=section(c,'Pasos exactos para reproducir',y)
    for n in range(1,4):y=line(c,y,f'{n}.')
    for label in ['Resultado esperado:', 'Resultado observado / tiempo de espera:', 'Evidencia guardada y frecuencia: __ veces de __ intentos:']:
        y=line(c,y,label)
    y=text(c,'Severidad:',M,y,size=9.2,font='InterSemi')-12
    for label,x in [('Crítica',M),('Alta',M+103),('Media',M+192),('Baja',M+295)]:checkbox(c,label,x,y)
    y-=26
    for label in ['Responsable / próxima fecha / medida temporal:', 'Versión corregida y repetición web / APK / otra cuenta:']:
        y=line(c,y,label)

def survey(c,p,i):
    y=base(c,p,i)
    y=text(c,'Participante / rol: ___________________  Fecha: _______________',M,y,size=9.3)-13
    y=section(c,'Tres tareas sin ayuda',y)
    rows=[['Rol','Consigna que puedes leer a la persona'],['Familia','«Revisa si tu hijo tiene un aviso importante, dime cuánto queda por pagar y encuentra cómo pedir permiso».'],['Docente','«Antes de pasar lista, averigua si alguien pidió permiso; registra el cuidado de dos niños con detalles diferentes».'],['Dirección','«Revisa qué ocurrió hoy, qué familias tienen saldo y cuál lista está confirmada, sin modificar la asistencia».'],['Estudiante / Secretaría','«Encuentra tu tarea y entrégala» / «Revisa el horario y distingue borrador de publicado», si esos roles aplican.'],['Propietario','«Encuentra los datos QA de un colegio, explica qué significa el saldo y exporta una vista».']]
    y=table(c,rows,[107,CW-107],y,size=9,pad=7)
    y=table(c,[['Tarea','Tiempo','Ayudas','Lo terminó / entendió'],['1','________','________','________________'],['2','________','________','________________'],['3','________','________','________________']],[150,80,75,CW-305],y,size=9,pad=8)
    y=section(c,'Preguntas después de observar',y)
    for value in ['¿Qué entendiste por este aviso, saldo o estado? ¿Qué acción creías que hacía el botón?', '¿En qué parte dudaste o te dio miedo equivocarte? ¿Qué palabra cambiarías?', 'Del 1 (muy difícil) al 5 (muy fácil), ¿cómo fue? ¿Lo repetirías mañana sin ayuda?', '¿Qué harías si no llega la notificación, no hay internet o el dato no coincide?']:
        y=text(c,value,M,y,size=9.5,leading=13.4)-9
    line(c,y,'Cambio concreto sugerido por la persona:')

def decision(c,p,i):
    y=base(c,p,i)
    conditions=[
    'Todos los casos críticos aplicables tienen OK en los canales y equipos acordados. Los NA tienen motivo y responsable que lo acepta.',
    'No quedan incidentes críticos ni fallos altos de funciones que se ofrecerán. No hay acceso entre familias, aulas o instituciones no autorizadas.',
    'Las familias reciben y abren sus avisos importantes en Android bajo condiciones documentadas; no dependen de que el emisor crea que envió.',
    'Se concilian pagos, recibos, abonos y saldos; las autorizaciones de recojo se contrastan presencialmente y con el niño correcto.',
    'El docente entiende permisos y confirmación de lista; Dirección distingue consulta de corrección. Personal entiende entrada, salida y descuentos.',
    'Se probó restauración completa en entorno separado. Si se ofrece banco automático, el cobro real coordinado y su conciliación pasaron.',
    'La sesión real del propietario en web y APK, otra marca Android, invitación real y recuperación de acceso tienen evidencia o un alcance comercial expresamente limitado.',
    'Una persona nueva de cada rol esencial completó sus tareas habituales sin ayuda constante. El equipo conoce el canal de soporte y el procedimiento alternativo acordado.'
    ]
    for value in conditions:
        checkbox(c,'',M,y-2)
        y=text(c,value,M+17,y,CW-17,size=9.4,leading=13.1)-12
    y=section(c,'Decisión conjunta',y-2)
    for label in ['Continuar el piloto: faltan casos o evidencia.', 'Corregir y repetir antes de ampliar.', 'Autorizar salida con el alcance y versiones registrados.']:
        checkbox(c,label,M,y);y-=23
    y=line(c,y-3,'Alcance autorizado / limitaciones comunicadas:')
    y=line(c,y,'Dirección / propietario / fecha y próxima revisión:')
    text(c,'Una sola casilla OK no certifica toda la plataforma. Si aparece información ajena, un cobro duplicado o una entrega incorrecta, detén ese circuito y conserva evidencia mínima para resolverlo.',M,y,size=9.1,leading=13,color=MUTED)

def actions(c,p,i):
    y=base(c,p,i)
    y=table(c,[['Pendiente','Responsable','Fecha','Cómo se comprobará'],['________________','____________','________','___________________'],['________________','____________','________','___________________'],['________________','____________','________','___________________'],['________________','____________','________','___________________']],[137,112,66,CW-315],y,size=8.8,pad=9)
    y=section(c,'Qué ya existía y qué comprobarán las personas',y)
    y=text(c,'Esta guía se preparó a partir de la implementación y las tandas internas disponibles al 29/10/2026. Esas verificaciones aportan referencias; los 48 casos de este cuaderno siguen pendientes hasta que el equipo los ejecute y anote su resultado. No se presenta el piloto humano como realizado.',M,y,size=9.6,leading=14)-15
    y=section(c,'Referencias de trabajo',y)
    for title,body in data.SOURCES:y=text(c,'**'+title+':** '+body,M,y,size=9.1,leading=13)-10
    y=note(c,'Dirección de la web','https://www.micole.click\nPanel del propietario: /app/schoolMetrics. El acceso exige la sesión de Superadministración. Para demostración con los colegios actuales, seleccionar Solo pruebas.',y)
    line(c,y,'Próxima reunión / contacto de soporte compartido con el equipo:')

HANDLERS={name:globals()[name] for name in ['cover','intro','plan','prepare','accounts','routing','cases','devices','journey','week','external','score','issue_example','issue_blank','survey','decision','actions']}
c=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
c.setTitle('MiCole - Guía del piloto humano: web y Android')
c.setAuthor('MiCole')
c.setSubject('48 escenarios propuestos, hojas de resultado y criterios de salida; no certifica pruebas realizadas.')
c.setViewerPreference('DisplayDocTitle','true')
for index,page in enumerate(PAGES):HANDLERS[page['kind']](c,page,index);c.showPage()
c.save()
metadata={'pdf':str(OUT.relative_to(ROOT)),'sha256':hashlib.sha256(OUT.read_bytes()).hexdigest(),'pages':len(PAGES),'cases':len(ALL),'roles':['Dirección','Docente','Familia','Estudiante','Secretaría','Superadministración'],'date':data.DATE,'version':data.VERSION,'referenceApk':19,'resultsInitiallyPending':True,'authoringAudit':AUDIT,'pageTitles':[{k:v for k,v in p.items() if k in ['key','title','chapter']} for p in PAGES]}
(ROOT/'output/pdf/MiCole-Piloto-Metadatos.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in metadata.items() if k not in ['authoringAudit','pageTitles']},ensure_ascii=False))
