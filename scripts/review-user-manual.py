#!/usr/bin/env python3
"""Render y verificaciones del PDF. No modifica las capturas originales."""
from pathlib import Path
import hashlib,json
import fitz
from PIL import Image

ROOT=Path(__file__).resolve().parents[1]
PDF=ROOT/'output/pdf/MiCole-Manual-Completo-Roles.pdf'
OUT=ROOT/'tmp/pdfs/manual/render'
OUT.mkdir(parents=True,exist_ok=True)
metadata=json.loads((ROOT/'output/pdf/MiCole-Manual-Metadatos.json').read_text())
doc=fitz.open(PDF)
assert len(doc)==metadata['pages']
assert hashlib.sha256(PDF.read_bytes()).hexdigest()==metadata['pdfSha256']
rows=[];text=[]
for index,page in enumerate(doc):
    value=page.get_text();text.append(value)
    assert len(value)>150,(index+1,'empty page')
    assert '\ufffd' not in value and '\u25a0' not in value,(index+1,'unsupported glyph')
    for block in page.get_text('dict')['blocks']:
        for line in block.get('lines',[]):
            for span in line['spans']:
                x0,y0,x1,y1=span['bbox']
                assert x0>=8 and y0>=8 and x1<=page.rect.width-8 and y1<=page.rect.height-8,(index+1,span['text'],'page edge')
    for link in page.get_links():
        if link['kind']==fitz.LINK_GOTO:assert 0<=link['page']<len(doc)
    pix=page.get_pixmap(matrix=fitz.Matrix(1.2,1.2),alpha=False)
    pix.save(str(OUT/f'page-{index+1:02d}.png'))
    rows.append({'page':index+1,'textChars':len(value),'embeddedImageCount':len(page.get_images()),'textWithinPage':True})
for first in range(0,len(doc),2):
    images=[Image.open(OUT/f'page-{index+1:02d}.png') for index in range(first,min(first+2,len(doc)))]
    width=sum(im.width for im in images)+20*(len(images)-1);height=max(im.height for im in images)
    sheet=Image.new('RGB',(width,height),'#DFE6F2');x=0
    for im in images:sheet.paste(im,(x,0));x+=im.width+20
    sheet.save(OUT/f'pair-{first//2+1:02d}.jpg',quality=90)
all_text='\n'.join(text)
for role in metadata['roles']:assert role in all_text,role
assert '49 controles' in all_text
assert 'se confirmó pendiente' not in all_text
report={'pdf':str(PDF.relative_to(ROOT)),'sha256':metadata['pdfSha256'],'pages':len(doc),'figures':metadata['figures'],'uniqueScreenshots':metadata['uniqueScreenshotFiles'],'bookmarks':len(doc.get_toc()),'links':sum(len(p.get_links()) for p in doc),'textAndLinkChecksPassed':True,'pageChecks':rows,'renderEngine':'PyMuPDF','reviewPairs':(len(doc)+1)//2}
(ROOT/'tmp/pdfs/manual/verification.json').write_text(json.dumps(report,ensure_ascii=False,indent=2)+'\n')
print(json.dumps({k:v for k,v in report.items() if k!='pageChecks'}))
