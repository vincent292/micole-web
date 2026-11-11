import type {School} from './types';
export const institutionTemplates=[
 {id:'aurora',name:'Aurora',description:'Luz, cercanía y espacios suaves. Para inicial y comunidades que quieren una bienvenida cálida.',primary:'#5B48B5',accent:'#D48745',preview:'Bienvenidos a un nuevo día',surface:'#F7F4FB',sidebar:'light'},
 {id:'academia',name:'Academia',description:'Una presencia editorial y sobria, con navegación oscura y documentos formales.',primary:'#173B58',accent:'#B58A36',preview:'Una comunidad que crece',surface:'#F4F6F8',sidebar:'dark'},
 {id:'bosque',name:'Bosque',description:'Verdes naturales, calma y un enfoque en el acompañamiento de cada estudiante.',primary:'#23614F',accent:'#A76D31',preview:'Cada paso cuenta',surface:'#F3F7F1',sidebar:'light'},
 {id:'atelier',name:'Atelier',description:'Color, creatividad y tarjetas expresivas, con acentos que acompañan el aprendizaje.',primary:'#A83E5C',accent:'#3D699D',preview:'Un lugar para descubrir',surface:'#FFF5F3',sidebar:'light'},
 {id:'horizonte',name:'Horizonte',description:'Precisión, contraste y navegación despejada para colegios con varias etapas.',primary:'#254EBB',accent:'#117E88',preview:'Aprender abre caminos',surface:'#F1F5FB',sidebar:'dark'},
] as const;
export type TemplateId=typeof institutionTemplates[number]['id'];
export interface SchoolAppearance {version:1;template:TemplateId;primary:string;accent:string;welcome:string;tagline:string}
export function appearanceFor(template:TemplateId):SchoolAppearance{
 const t=institutionTemplates.find(t=>t.id===template)!;
 return {version:1,template,primary:t.primary,accent:t.accent,welcome:t.preview,tagline:'Aprendemos, compartimos y crecemos juntos.'};
}
export function parseAppearance(value:unknown):SchoolAppearance|undefined{
 const v=value as SchoolAppearance|undefined;
 if(!v||!institutionTemplates.some(t=>t.id===v.template)||!/^#[\da-f]{6}$/i.test(v.primary)||!/^#[\da-f]{6}$/i.test(v.accent)||typeof v.welcome!=='string'||v.welcome.length>140||typeof v.tagline!=='string'||v.tagline.length>100)return;
 return {version:1,template:v.template,primary:v.primary.toUpperCase(),accent:v.accent.toUpperCase(),welcome:v.welcome,tagline:v.tagline};
}
export function readableInk(color:string){
 const components=[1,3,5].map(i=>parseInt(color.slice(i,i+2),16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
 const luminance=components[0]*.2126+components[1]*.7152+components[2]*.0722;
 if(1.05/(luminance+.05)>=4.5)return '#FFFFFF';
 const dark=[20,36,46].map(v=>v/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4),darkL=dark[0]*.2126+dark[1]*.7152+dark[2]*.0722;
 return (luminance+.05)/(darkL+.05)>=4.5?'#14242E':'#000000';
}
export function schoolAppearanceStyle(school?:School,override?:SchoolAppearance){
 const a=parseAppearance(override||school?.appearance);if(!a)return {};
 const t=institutionTemplates.find(t=>t.id===a.template)!;
 return {'--institution-primary':a.primary,'--institution-accent':a.accent,'--institution-ink':readableInk(a.primary),'--institution-canvas':t.surface,'--institution-sidebar':t.sidebar==='dark'?a.primary:'#FFFFFF','--institution-sidebar-ink':t.sidebar==='dark'?readableInk(a.primary):'#253746','--school-color':a.primary};
}
export function letterheadSchool(school:School){return {...school,color:parseAppearance(school.appearance)?.primary||school.color};}
