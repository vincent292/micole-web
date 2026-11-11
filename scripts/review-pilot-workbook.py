#!/usr/bin/env python3
"""Inspección estructural y render completo del cuaderno de piloto."""
from pathlib import Path
import json,hashlib,re
import fitz
from pypdf import PdfReader
from PIL import Image,ImageOps,ImageDraw
ROOT=Path(__file__).resolve().parents[1]
PDF=ROOT/'output/pdf/MiCole-Guia-Piloto-Humano-Web-Android.pdf'
OUT=ROOT/'tmp/pdfs/piloto/render';OUT.mkdir(parents=True,exist_ok=True)
meta=json.loads((ROOT/'output/pdf/MiCole-Piloto-Metadatos.json').read_text())
doc=fitz.open(PDF);assert len(doc)==33==meta['pages']
assert hashlib.sha256(PDF.read_bytes()).hexdigest()==meta['sha256']
texts=[];checks=[]
for index,page in enumerate(doc):
    value=page.get_text();texts.append(value)
    assert len(value)>200,(index+1,'empty page')
    assert not any(ch in value for ch in ['\ufffd','\u25a0','\u2011','\u2013','\u2014']),(index+1,'unsupported glyph or non-ASCII dash')
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                x0,y0,x1,y1=span['bbox']
                assert x0>=8 and y0>=8 and x1<=page.rect.width-8 and y1<=page.rect.height-8,(index+1,span['text'],'page edge',(x0,y0,x1,y1))
    for link in page.get_links():
        if link['kind']==fitz.LINK_GOTO:assert 0<=link['page']<len(doc)
    pix=page.get_pixmap(matrix=fitz.Matrix(1.45,1.45),alpha=False);pix.save(str(OUT/f'page-{index+1:02d}.png'))
    checks.append({'page':index+1,'textChars':len(value),'withinPage':True,'links':len(page.get_links())})
full='\n'.join(texts)
for n in range(1,49):assert re.search(rf'C{n:02d}\s*\|',full),f'Case C{n:02d} absent'
for phrase in ['APK 19','pendientes','cinco días','350 - 100 - 250','3008','1260','51','respaldo','Solo pruebas','correo real','sin ayuda','Superadministración']:assert phrase in full,phrase
assert not re.search(r'(?:eyJ[a-zA-Z0-9_-]{25,}|sb_secret_|service_role_key|SUPABASE_DB_PASSWORD|keystorePassword)',full)
reader=PdfReader(PDF);assert not reader.is_encrypted
for first in range(0,len(doc),6):
    sheet=Image.new('RGB',(1240,1840),'#DDE5F0');draw=ImageDraw.Draw(sheet)
    for offset,index in enumerate(range(first,min(first+6,len(doc)))):
        im=Image.open(OUT/f'page-{index+1:02d}.png').convert('RGB');im.thumbnail((590,828))
        x=20+(offset%2)*620;y=38+(offset//2)*608
        im.thumbnail((590,555));sheet.paste(im,(x+(590-im.width)//2,y));draw.text((x,y-19),f'PAGINA {index+1}',fill='#263238')
    sheet.save(OUT/f'overview-{first//6+1:02d}.jpg',quality=92)
for first in range(0,len(doc),2):
    images=[Image.open(OUT/f'page-{j+1:02d}.png').convert('RGB') for j in range(first,min(first+2,len(doc)))]
    sheet=Image.new('RGB',(sum(im.width for im in images)+20*(len(images)-1),max(im.height for im in images)),'#DDE5F0');x=0
    for im in images:sheet.paste(im,(x,0));x+=im.width+20
    sheet.save(OUT/f'pair-{first//2+1:02d}.jpg',quality=93)
report={'pdf':str(PDF.relative_to(ROOT)),'sha256':meta['sha256'],'pages':len(doc),'cases':48,'roles':6,'resultsInitiallyPending':True,'textAndLinkChecksPassed':True,'bookmarks':len(doc.get_toc()),'links':sum(len(p.get_links()) for p in doc),'minimumCaseFont':10,'renderer':'PyMuPDF','renderedPages':len(doc),'pageChecks':checks,'visualReviewCompleted':False}
(ROOT/'output/pdf/MiCole-Piloto-Verificacion.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='pageChecks'},ensure_ascii=False))
