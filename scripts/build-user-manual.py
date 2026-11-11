#!/usr/bin/env python3
"""Genera el manual PDF y su fuente Markdown con capturas QA originales."""
from pathlib import Path
import sys, json, re, importlib.util, hashlib
from xml.sax.saxutils import escape
from PIL import Image
from fontTools.ttLib import TTFont as FontFile
from reportlab.pdfgen import canvas
from reportlab.pdfbase import pdfmetrics
from reportlab.pdfbase.ttfonts import TTFont
from reportlab.lib.colors import HexColor, Color, white
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import Paragraph, Table, TableStyle
from reportlab.lib.utils import ImageReader
from reportlab.lib.pagesizes import A4

ROOT=Path(__file__).resolve().parents[1]
spec=importlib.util.spec_from_file_location('manual_content',ROOT/'docs/manual/contenido.py')
content=importlib.util.module_from_spec(spec);spec.loader.exec_module(content)
PAGES=content.PAGES
OUT=ROOT/'output/pdf/MiCole-Manual-Completo-Roles.pdf'
TMP=ROOT/'tmp/pdfs/manual'
OUT.parent.mkdir(parents=True,exist_ok=True);(TMP/'fonts').mkdir(parents=True,exist_ok=True)
for family,weight,name in [('inter',400,'Inter'),('inter',600,'InterSemi'),('inter',700,'InterBold'),('poppins',600,'Poppins'),('poppins',700,'PoppinsBold')]:
    src=ROOT/f'node_modules/@fontsource/{family}/files/{family}-latin-{weight}-normal.woff'
    dst=TMP/'fonts'/f'{name}.ttf'
    if not dst.exists():
        f=FontFile(src);f.flavor=None;f.save(dst)
    pdfmetrics.registerFont(TTFont(name,str(dst)))
pdfmetrics.registerFontFamily('Inter',normal='Inter',bold='InterBold',italic='Inter',boldItalic='InterBold')
W,H=A4;M=44;CW=W-2*M
BLUE=HexColor('#3D6EF7');GREEN=HexColor('#16835F');MINT=HexColor('#54D2A0');YELLOW=HexColor('#FFC857');INK=HexColor('#263238');MUTED=HexColor('#586779');BG=HexColor('#F8FAFF');LINE=HexColor('#DFE6F2');LIGHT=HexColor('#ECF2FF')
CHAPTER_COLORS={'Dirección':BLUE,'Docente':HexColor('#16835F'),'Familia':HexColor('#7957B0'),'Estudiante':HexColor('#246B9F'),'Secretaría académica':HexColor('#A56B19'),'Superadministración':HexColor('#3F4F67')}
NUM={p['key']:i+1 for i,p in enumerate(PAGES)}
AUDIT=[];IMAGES=[]

def rich(text):
    t=escape(str(text)).replace('\n','<br/>')
    return re.sub(r'\*\*(.*?)\*\*',r'<b>\1</b>',t)

def para(c,text,x,y,width,size=10.2,leading=15,color=INK,font='Inter',bottom=65):
    style=ParagraphStyle('body',fontName=font,fontSize=size,leading=leading,textColor=color,spaceAfter=0,allowWidows=0,allowOrphans=0)
    p=Paragraph(rich(text),style);_,height=p.wrap(width,2000)
    if y-height<bottom:raise ValueError(f'Page {c.getPageNumber()} overflow: {text[:65]} at {y-height:.1f}')
    p.drawOn(c,x,y-height);AUDIT.append({'page':c.getPageNumber(),'kind':'text','top':round(y,2),'bottom':round(y-height,2),'size':size,'text':str(text)[:90]})
    return y-height

def box(c,label,text,x,y,width,kind='note',size=9.3):
    bg=HexColor('#EAF8F1') if kind=='result' else LIGHT
    fg=GREEN if kind=='result' else BLUE
    style=ParagraphStyle('box',fontName='Inter',fontSize=size,leading=size*1.42,textColor=INK)
    p=Paragraph(rich(text),style);_,ph=p.wrap(width-24,2000);height=ph+48
    if y-height<66:raise ValueError(f'Page {c.getPageNumber()} box overflow: {label}')
    c.setFillColor(bg);c.roundRect(x,y-height,width,height,9,fill=1,stroke=0)
    c.setFillColor(fg);c.setFont('InterBold',8.3);c.drawString(x+12,y-18,label.upper())
    p.drawOn(c,x+12,y-height+13);AUDIT.append({'page':c.getPageNumber(),'kind':'box','bottom':round(y-height,2),'label':label})
    return y-height-12

def base(c,p,index):
    c.setFillColor(white);c.rect(0,0,W,H,fill=1,stroke=0)
    color=CHAPTER_COLORS.get(p['chapter'],BLUE)
    c.setFillColor(color);c.rect(0,H-8,W,8,fill=1,stroke=0)
    c.setFont('InterSemi',8);c.setFillColor(MUTED);c.drawString(M,H-33,'MICOLE  /  MANUAL DE USO')
    c.setFillColor(color);c.drawRightString(W-M,H-33,p['chapter'].upper())
    c.setStrokeColor(LINE);c.line(M,49,W-M,49)
    c.setFont('Inter',7.5);c.setFillColor(MUTED);c.drawString(M,34,'Edición '+content.VERSION+'  |  Web y APK Android')
    c.drawCentredString(W/2,34,'Índice')
    c.linkRect('', 'indice',(W/2-24,26,W/2+24,43),relative=0,thickness=0)
    c.drawRightString(W-M,34,f'{index+1} / {len(PAGES)}')
    c.bookmarkPage(p['key'])
    first=index==0 or PAGES[index-1]['chapter']!=p['chapter']
    if first:c.addOutlineEntry(p['chapter'],p['key'],level=0,closed=False)
    elif p['kind']!='contents':c.addOutlineEntry(p['title'],p['key'],level=1,closed=False)
    y=H-70
    y=para(c,p['title'],M,y,CW,size=22,leading=28,font='PoppinsBold')-14
    if p['lead']:y=para(c,p['lead'],M,y,CW,size=10.3,leading=15.2,color=MUTED)-16
    if p['route']:
        style=ParagraphStyle('route',fontName='InterSemi',fontSize=8.3,leading=12,textColor=BLUE)
        rp=Paragraph(rich(p['route']),style);_,rh=rp.wrap(CW-22,200)
        c.setFillColor(LIGHT);c.roundRect(M,y-rh-16,CW,rh+16,7,fill=1,stroke=0);rp.drawOn(c,M+11,y-rh-8);y-=rh+31
    return y

def screenshot(c,path,x,y,width,caption):
    path=ROOT/path;assert path.is_file(),path
    im=Image.open(path);iw,ih=im.size
    web=any(s in path.name for s in ['web-','-web','grupo-web','direccion-web'])
    top=108 if web and ih>=900 else 30 if ih>=900 else 0
    bottom=64 if ih>=900 else 0
    vh=ih-top-bottom;scale=width/iw;height=vh*scale
    maxh=430
    if height>maxh:scale=maxh/vh;width=iw*scale;height=maxh
    c.setFillColor(HexColor('#EDF2FB'));c.roundRect(x-5,y-height-5,width+10,height+10,8,fill=1,stroke=0)
    c.saveState();clip=c.beginPath();clip.rect(x,y-height,width,height);c.clipPath(clip,stroke=0,fill=0)
    c.drawImage(ImageReader(str(path)),x,y-height-bottom*scale,width=iw*scale,height=ih*scale,mask='auto')
    c.restoreState();c.setStrokeColor(LINE);c.roundRect(x-5,y-height-5,width+10,height+10,8,fill=0,stroke=1)
    number=len(IMAGES)+1
    para(c,f'FIGURA {number:02d}  ·  '+caption,x,y-height-16,width,size=8.2,leading=11.5,color=MUTED)
    IMAGES.append({'figure':number,'source':str(path.relative_to(ROOT)),'page':c.getPageNumber(),'sourceSize':[iw,ih],'cropTop':top,'cropBottom':bottom})

def flow(c,labels,y):
    n=len(labels);gap=17;width=(CW-gap*(n-1))/n;height=74
    if y-height<68:raise ValueError(f'Flow overflow page {c.getPageNumber()}')
    for i,label in enumerate(labels):
        x=M+i*(width+gap);c.setFillColor(LIGHT);c.roundRect(x,y-height,width,height,9,fill=1,stroke=0)
        c.setFillColor(BLUE);c.circle(x+17,y-17,9,fill=1,stroke=0);c.setFillColor(white);c.setFont('InterBold',8);c.drawCentredString(x+17,y-20,str(i+1))
        para(c,label,x+12,y-35,width-24,size=9.3,leading=12.5,font='InterSemi')
        if i<n-1:
            ax=x+width+4;ay=y-height/2;c.setStrokeColor(BLUE);c.setLineWidth(1.2);c.line(ax,ay,ax+9,ay);c.line(ax+6,ay+3,ax+9,ay);c.line(ax+6,ay-3,ax+9,ay)
    para(c,'DIAGRAMA DE OPERACIÓN  ·  No es una captura de pantalla.',M,y-height-9,CW,size=7.5,leading=10,color=MUTED)

def workflow(c,p,index):
    y=base(c,p,index);has_photo=bool(p['photo']);left=CW-230 if has_photo else CW
    if has_photo:screenshot(c,p['photo'],W-M-207,y-3,202,p['caption'])
    for i,text in enumerate(p['steps']):
        c.setFillColor(CHAPTER_COLORS.get(p['chapter'],BLUE));c.circle(M+8,y-8,8,fill=1,stroke=0)
        c.setFillColor(white);c.setFont('InterBold',8);c.drawCentredString(M+8,y-10.8,str(i+1))
        y=para(c,text,M+25,y,left-25,size=10.1 if has_photo else 10.5,leading=14.6 if has_photo else 15.5)-12
    if p['result']:y=box(c,'Al terminar',p['result'],M,y-2,left,kind='result',size=9.0 if has_photo else 9.7)
    if p['note']:y=box(c,'Ten en cuenta',p['note'],M,y,left,size=8.8 if has_photo else 9.5)
    if p['flow']:
        fy=min(y-6,228)
        flow(c,p['flow'],fy)

def cover(c,p,index):
    c.bookmarkPage(p['key']);c.addOutlineEntry('Portada',p['key'],level=0,closed=False)
    c.setFillColor(BG);c.rect(0,0,W,H,fill=1,stroke=0)
    c.setFillColor(BLUE);c.rect(0,H-235,W,235,fill=1,stroke=0)
    c.setFillColor(MINT);c.circle(W-25,H-208,95,fill=1,stroke=0)
    c.setFillColor(YELLOW);c.circle(W-91,H-85,35,fill=1,stroke=0)
    # Use the same source-image viewport as the application's Brand component.
    c.setFillColor(white);c.roundRect(M,H-154,292,100,14,fill=1,stroke=0)
    lx=M+21;ly=H-147;scale=250/1386;lh=479*scale
    c.saveState();clip=c.beginPath();clip.rect(lx,ly,250,lh);c.clipPath(clip,stroke=0,fill=0)
    c.drawImage(str(ROOT/'public/brand/logo-horizontal.png'),lx-48*scale,ly-(1086-288-479)*scale,width=1448*scale,height=1086*scale,mask='auto');c.restoreState()
    y=H-281;y=para(c,'Manual completo\nde uso',M,y,CW,size=36,leading=45,font='PoppinsBold')-22
    y=para(c,'Kínderes y guarderías',M,y,CW,size=20,leading=27,font='Poppins',color=BLUE)-12
    y=para(c,'Recorridos paso a paso para trabajar en la web y la APK Android.',M,y,CW,size=13,leading=20,color=MUTED)-28
    chips=['Dirección','Docentes','Familias','Estudiantes','Secretaría académica','Superadministración']
    for i,label in enumerate(chips):
        x=M+(i%2)*254;cy=y-(i//2)*39;c.setFillColor(white);c.setStrokeColor(LINE);c.roundRect(x,cy-27,245,31,7,fill=1,stroke=1);c.setFont('InterSemi',10);c.setFillColor(INK);c.drawString(x+12,cy-16,label)
    y-=145
    y=para(c,'Incluye capturas de uso, permisos, solución de problemas y una hoja de piloto para imprimir.',M,y,CW,size=10.5,leading=16,color=MUTED)-16
    para(c,'Las imágenes utilizan datos ficticios. Los códigos QA y los importes de ejemplo no son datos que debas copiar ni tarifas comerciales.',M,y,CW,size=9,leading=14,color=MUTED)
    c.setStrokeColor(LINE);c.line(M,108,W-M,108);c.setFillColor(INK);c.setFont('InterBold',10);c.drawString(M,86,'Edición '+content.VERSION+'  |  '+content.DATE)
    c.setFont('Inter',9);c.setFillColor(MUTED);c.drawString(M,67,'Referencia visual: web publicada y APK 16 a 18')
    c.setFillColor(BLUE);c.drawRightString(W-M,67,'www.micole.click');c.linkURL('https://www.micole.click',(W-M-110,60,W-M,78),relative=0)

def contents(c,p,index):
    y=base(c,p,index)
    entries=[('instalar','Primeros pasos','Instalación, acceso, navegación y permisos'),('crear-aviso','Comunicación','Publicar, recibir y confirmar avisos'),('direccion-inicio','Dirección','Preparar la sede y supervisar su operación'),('docente-inicio','Docente','Aula, asistencia, cuidados y aprendizaje'),('familia-inicio','Familia','Hijos, comunicación, recojos y pagos'),('estudiante-inicio','Estudiante','Tareas y contenido académico personal'),('secretaria-borrador','Secretaría académica','Planificar horarios según delegación'),('plataforma-alta','Superadministración','Operación interna de MiCole'),('ayuda-acceso','Solución de problemas','Acceso, red, archivos, GPS y saldos'),('piloto','Piloto y salida a venta','Plan, lista imprimible y pendientes'),('glosario','Consulta rápida','Glosario, versión y fuentes')]
    for key,title,desc in entries:
        h=44;c.setFillColor(LIGHT if y%2 else BG);c.roundRect(M,y-h,CW,h-3,7,fill=1,stroke=0)
        c.setFillColor(INK);c.setFont('InterBold',10);c.drawString(M+12,y-16,title)
        c.setFillColor(MUTED);c.setFont('Inter',8.4);c.drawString(M+12,y-31,desc)
        c.setFillColor(BLUE);c.setFont('InterBold',11);c.drawRightString(W-M-12,y-24,str(NUM[key]));c.linkRect('',key,(M,y-h,W-M,y),relative=0,thickness=0);y-=h+5
    para(c,'El índice, los marcadores del PDF y el enlace Índice del pie permiten saltar entre recorridos. Empieza por tu rol; lee también los pasos comunes de comunicación.',M,y-6,CW,size=9.3,leading=14,color=MUTED)

def table(c,data,widths,x,y,size=8.4,header=True):
    ps=ParagraphStyle('cell',fontName='Inter',fontSize=size,leading=size*1.35,textColor=INK)
    hs=ParagraphStyle('cellh',fontName='InterBold',fontSize=size,leading=size*1.35,textColor=white)
    cells=[[Paragraph(rich(v),hs if i==0 and header else ps) for v in row] for i,row in enumerate(data)]
    t=Table(cells,colWidths=widths,hAlign='LEFT')
    cmds=[('VALIGN',(0,0),(-1,-1),'TOP'),('LEFTPADDING',(0,0),(-1,-1),8),('RIGHTPADDING',(0,0),(-1,-1),8),('TOPPADDING',(0,0),(-1,-1),8),('BOTTOMPADDING',(0,0),(-1,-1),8),('LINEBELOW',(0,0),(-1,-1),.4,LINE)]
    if header:cmds += [('BACKGROUND',(0,0),(-1,0),BLUE)]
    for i in range(1 if header else 0,len(data)):
        if i%2:cmds.append(('BACKGROUND',(0,i),(-1,i),BG))
    t.setStyle(TableStyle(cmds));_,height=t.wrap(sum(widths),2000)
    if y-height<67:raise ValueError(f'Table overflow page {c.getPageNumber()} {height} > {y-67}')
    t.drawOn(c,x,y-height);AUDIT.append({'page':c.getPageNumber(),'kind':'table','bottom':round(y-height,2)})
    return y-height-14

def matrix(c,p,index):
    y=base(c,p,index)
    rows=[['Acción','Direc.','Docente','Familia','Estud.','Secret.','Plataf.'],['Identidad y sede','G','-','-','-','-','G / Sop'],['Aulas y alumnos','G','V aula','V hijos','V propio','-','Sop'],['Cuidados','G','G aula','V hijos','-','-','Sop'],['Asistencia alumnos','V','G aula','V hijos','-','-','Sop'],['Cuaderno privado','G','G aula','V hijos','-','-','Sop'],['Tareas y entregas','G','G materia','V hijos','E propia','-','Sop'],['Agenda y avisos','G','G aula','V / R','V acad.','-','Sop'],['Permisos y recojos','A','A aula','R propia','-','-','Sop'],['Mensualidades y recibos','G','-','V / pago','-','-','Sop'],['Cobro de actividad','G','G limitado','V / pago','-','-','Sop'],['Horarios de clases','G / A','V','V aula','V aula','G / A*','Sop'],['Llegadas y boletas','G','Propio','-','-','-','Sop'],['Crédito / licencias','V / pago','-','-','-','-','G'],['Administrar MiCole','-','-','-','-','-','G']]
    y=table(c,rows,[139]+[(CW-139)/6]*6,M,y,size=7.8)
    y=para(c,'**G** gestiona. **V** consulta. **A** aprueba. **R** responde o solicita desde su cuenta. **E** entrega su trabajo. **Sop** operación escolar únicamente mediante soporte autorizado. **A*** solo si Dirección concedió publicación.',M,y,CW,size=8.9,leading=13)-12
    box(c,'Alcance',f'Cada permiso se limita a la sede, aula, materia o hijo autorizado. La tutoría no permite editar otra materia. Mantén los clientes actualizados y revisa las comprobaciones de salida a venta de la página {NUM["salida-venta"]}.',M,y,CW,size=9)

def demo_accounts(c,p,index):
    y=base(c,p,index)
    lines=(ROOT/'docs/CUENTAS-DE-PRUEBA-PARA-DEMO.md').read_text().splitlines()
    rows=[]
    for line in lines:
        if line.startswith('| ') and not line.startswith('| ---'):
            rows.append([v.strip() for v in line.strip('|').split('|')])
    assert len(rows)==14
    y=table(c,rows,[80,218,CW-298],M,y,size=7.9)
    y=box(c,'Recorrido de demostración','Dirección publica un aviso ficticio para Lucía o Mateo. Mamá lo revisa y confirma en la APK; papá sigue pendiente hasta confirmar desde su propia cuenta. Otra familia y la otra institución quedan excluidas.',M,y,CW,size=9.1)
    box(c,'Acceso','Usa la contraseña privada ya configurada para estas cuentas de test. No se incluye en este documento. Para un piloto con personas del kínder, invita a cada participante con su propio correo y rol.',M,y,CW,size=9.1)

def pilot(c,p,index):
    y=base(c,p,index);y=para(c,'Sede: ____________________   Fecha: ______________   APK: _______',M,y,CW,size=9.4,leading=15)-11
    y=para(c,'Responsable: ____________________   Personas participantes: ____________________',M,y,CW,size=9.4,leading=15)-17
    checks=[('01','Acceso','Cada rol entra con su cuenta, sede e hijo correctos.'),('02','Inscripción','Una inscripción y ficha nuevas coinciden en web y APK.'),('03','Asistencia','Se confirma la lista y la familia ve el estado correcto.'),('04','Cuidados','Dos niños tienen notas distintas; el excluido no recibe el lote.'),('05','Dirección','El aviso académico llega a los padres y alumno elegidos.'),('06','Docente','Su aviso llega al aula; otra aula o sede queda excluida.'),('07','Lectura','Mamá y papá confirman por separado; el alumno no acepta por ellos.'),('08','Android','Con app cerrada/bloqueada llega y abre el aviso correcto.'),('09','Recojo','Se revisan autorización, carnet y procedimiento presencial.'),('10','Tarea','Alumno entrega; docente revisa; familia consulta.'),('11','Pago controlado','El ingreso acordado genera un recibo y el saldo esperado.'),('12','Conexión','El reintento recupera el trabajo sin duplicar el resultado.')]
    rows=[['Caso','Comprobación','OK / repetir']]+[[a+' · '+b,t,'[  ]  /  [  ]'] for a,b,t in checks]
    y=table(c,rows,[91,CW-171,80],M,y,size=8.2)
    y=para(c,'Hallazgo / acción / responsable:',M,y,CW,size=9.4,leading=14,font='InterSemi')-15
    for _ in range(3):c.setStrokeColor(LINE);c.line(M,y,W-M,y);y-=22
    para(c,'Usa cuentas y datos de entrenamiento para provocar errores. Una operación real requiere coordinación expresa con sus responsables.',M,y-1,CW,size=8.4,leading=12,color=MUTED)

def glossary(c,p,index):
    y=base(c,p,index)
    rows=[['Concepto','Qué significa'],['Sede / institución','Ámbito de trabajo. No mezcles alumnos, cobros o configuración entre sedes.'],['Gestión / aula / materia','Año de trabajo, grupo y área opcional; son contextos diferentes.'],['Borrador / publicado','Preparado para revisar frente a disponible para sus destinatarios.'],['Leer / confirmar','Abrir contenido frente a registrar expresamente He leído.'],['Autorizar','Responder a una actividad o a una solicitud específica; no se deduce de pagar.'],['Solicitado / aprobado / entregado','En recojo: pedido, decisión y comprobación presencial son momentos diferentes.'],['Cuota / abono / saldo','Importe emitido, dinero aplicado y lo que queda por pagar.'],['Comprobante / recibo','Documento presentado frente al registro del cobro confirmado.'],['QR generado / pago confirmado','La imagen permite pagar; la confirmación requiere verificar el ingreso.'],['Factura solicitada / emitida','Pedido pendiente frente a factura producida por el procedimiento fiscal externo.'],['Borrador en memoria','Temporal de la sesión; no equivale a guardado persistente ni a modo sin conexión.'],['Notificación / recepción / lectura','Creación del aviso, aparición en el teléfono y consulta del contenido.'],['Soporte / prueba','Sesión delegada para un caso frente a un entorno de simulación identificado.']]
    table(c,rows,[125,CW-125],M,y,size=9)

def sources(c,p,index):
    y=base(c,p,index)
    for title,text in [
        ('Edición y contexto',f'Versión {content.VERSION}, {content.DATE}. Referencia visual: web publicada y APK Android 16 a 18. Las sedes, niveles, delegaciones y futuras versiones pueden cambiar qué opciones aparecen.'),
        ('Imágenes de este manual','Se reutilizaron capturas de las pruebas funcionales del 27 al 29 de octubre con personas e importes ficticios. Se recortan únicamente los márgenes del teléfono en la composición del PDF. Los diagramas están identificados y no pretenden ser pantallas de la aplicación.'),
        ('Base documental','Se contrastaron la interfaz y los permisos del producto con las guías internas de acceso, kínder, operación, avisos, expediente, asistencia, tareas, entrevistas, horarios, evaluaciones, crédito, recojos, comprobantes y banco.'),
        ('Qué no acredita','El documento no acredita una transferencia bancaria, una entrega real de un niño, cumplimiento legal integral ni una restauración completa de respaldo. Las comprobaciones pendientes y el piloto deben registrarse por separado.'),
        ('Uso y mantenimiento','Comparte con cada persona los capítulos de su rol. El apartado de Superadministración corresponde al operador de MiCole. Actualiza el manual cuando cambien pantallas, permisos, procesos o tarifas.'),
        ('Dónde entrar','Sitio oficial: https://www.micole.click. Instala y actualiza la APK mediante el canal oficial que te indique la institución. Si Android rechaza una actualización, solicita el paquete compatible; no desinstales por cuenta propia para resolverlo.')
    ]:
        y=para(c,title,M,y,CW,size=11,leading=16,font='InterBold',color=BLUE)-6
        y=para(c,text,M,y,CW,size=10,leading=15)-17
    para(c,'Marca y paleta: MiCole. Tipografías Inter y Poppins, incrustadas para conservar la presentación.',M,y,CW,size=8.5,leading=12,color=MUTED)

def build():
    c=canvas.Canvas(str(OUT),pagesize=A4,pageCompression=1)
    c.setTitle('MiCole - Manual completo de todos los roles');c.setAuthor('MiCole');c.setSubject('Uso de web y APK para kínderes y guarderías');c.setCreator('MiCole - Documentación operativa')
    handlers={'cover':cover,'contents':contents,'matrix':matrix,'pilot':pilot,'glossary':glossary,'sources':sources,'demo_accounts':demo_accounts}
    for i,p in enumerate(PAGES):
        handlers.get(p['kind'],workflow)(c,p,i);c.showPage()
    c.save()
    metadata={'version':content.VERSION,'date':content.DATE,'pages':len(PAGES),'roles':['Dirección','Docente','Familia','Estudiante','Secretaría académica','Superadministración'],'figures':len(IMAGES),'uniqueScreenshotFiles':len(set(i['source'] for i in IMAGES)),'sourceImages':IMAGES,'pageMap':[{k:p[k] for k in ['key','chapter','title']}|{'page':i+1} for i,p in enumerate(PAGES)],'pdfSha256':hashlib.sha256(OUT.read_bytes()).hexdigest()}
    (TMP/'layout-audit.json').write_text(json.dumps(AUDIT,ensure_ascii=False,indent=2)+'\n')
    (ROOT/'output/pdf/MiCole-Manual-Metadatos.json').write_text(json.dumps(metadata,ensure_ascii=False,indent=2)+'\n')
    md=['# MiCole - Manual completo de uso',f'Edición {content.VERSION} - {content.DATE}','']
    for i,p in enumerate(PAGES):
        md += [f'## {i+1}. {p["title"]}',f'Rol / sección: {p["chapter"]}',p['route'],p['lead'],'']
        md += [f'{j+1}. {s}' for j,s in enumerate(p['steps'])]
        if p['result']:md += ['','**Al terminar:** '+p['result']]
        if p['note']:md += ['','**Ten en cuenta:** '+p['note']]
        if p['photo']:md += ['',f'Imagen: {p["photo"]}',p['caption']]
        md += ['']
    (ROOT/'docs/manual/Manual-MiCole.md').write_text('\n'.join(md)+'\n')
    print(json.dumps({'pdf':str(OUT),'pages':len(PAGES),'figures':len(IMAGES),'uniqueScreenshots':metadata['uniqueScreenshotFiles'],'layoutElementsChecked':len(AUDIT),'sizeBytes':OUT.stat().st_size}))

if __name__=='__main__':build()
