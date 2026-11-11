from pathlib import Path
import fitz,json
src=Path('output/pdf/identidad-prueba');out=Path('tmp/branding-pdf-renders');out.mkdir(parents=True,exist_ok=True);report=[]
contact=fitz.open();sheet=contact.new_page(width=1190,height=1684)
for index,path in enumerate(sorted(src.glob('*.pdf'))):
 doc=fitz.open(path);text=''
 for n,page in enumerate(doc):
  text+=page.get_text();page.get_pixmap(matrix=fitz.Matrix(1.5,1.5)).save(out/(path.stem+f'-{n+1}.png'))
  for block in page.get_text('dict')['blocks']:
   for line in block.get('lines',[]):
    for span in line['spans']:
     x0,y0,x1,y1=span['bbox'];assert min(x0,y0)>=0 and x1<=page.rect.width+1 and y1<=page.rect.height+1,(path,span['text'])
 assert 'pruebas' in text.lower();report.append({'file':str(path),'pages':len(doc),'textCharacters':len(text),'pageOverflow':False})
 if index in [1,2,3,4]:
  k=index-1;r=fitz.Rect((k%2)*595,(k//2)*842,(k%2+1)*595,(k//2+1)*842);sheet.show_pdf_page(r,doc,0)
assert len(report)==6
sheet.get_pixmap(matrix=fitz.Matrix(1,1)).save(out/'document-contact-sheet.png')
Path('output/qa/2026-11-09-branding/pdf-verification.json').write_text(json.dumps({'status':'passed','files':report},ensure_ascii=False,indent=2));print(json.dumps({'status':'passed','pdfCount':len(report),'pageOverflow':False}))
