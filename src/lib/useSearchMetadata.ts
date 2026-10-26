import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import meta from './site-meta.json';
export function useSearchMetadata() {
  const {pathname,search,hash} = useLocation();
  useEffect(()=>{
    const configured = import.meta.env.VITE_SITE_URL;
    let origin='';try{origin=configured?new URL(configured).origin:'';}catch{/* No index until the public domain is configured. */}
    const visible = pathname==='/' && !new URLSearchParams(search).has('code') && !hash.includes('access_token=') && import.meta.env.VITE_PUBLIC_DEMO!=='true' && import.meta.env.VITE_APP_MODE==='live' && origin===window.location.origin;
    let robots = document.querySelector<HTMLMetaElement>('meta[name="robots"]');
    if(!robots){robots=document.createElement('meta');robots.name='robots';document.head.append(robots);}
    robots.content=visible?'index, follow, max-image-preview:large':'noindex, nofollow';
    document.title=visible?meta.title:import.meta.env.VITE_PUBLIC_DEMO==='true'?'Demo MiCole · Explora tu comunidad':pathname.startsWith('/instituciones/')?'Instituciones | MiCole':pathname==='/login'?'Ingresar | MiCole':'MiCole · Espacio privado';
    document.querySelectorAll('link[rel="canonical"],meta[property^="og:"],meta[name^="twitter:"],#micole-search-schema').forEach(node=>{
      // Private SPA routes never retain public sharing or structured metadata.
      if(!visible)node.remove();
    });
    if(visible){
      const setMeta=(attribute:'name'|'property',key:string,value:string)=>{let tag=document.querySelector<HTMLMetaElement>(`meta[${attribute}="${key}"]`);if(!tag){tag=document.createElement('meta');tag.setAttribute(attribute,key);document.head.append(tag);}tag.content=value;};
      setMeta('name','description',meta.description);
      for(const [key,value] of Object.entries({'og:type':'website','og:site_name':meta.name,'og:locale':'es_BO','og:title':meta.title,'og:description':meta.description,'og:url':origin+'/','og:image':origin+meta.image,'og:image:alt':'MiCole, gestión para colegios y guarderías'}))setMeta('property',key,value);
      for(const [key,value] of Object.entries({'twitter:card':'summary_large_image','twitter:title':meta.title,'twitter:description':meta.description,'twitter:image':origin+meta.image}))setMeta('name',key,value);
      if(!document.getElementById('micole-search-schema')){const script=document.createElement('script');script.id='micole-search-schema';script.type='application/ld+json';script.textContent=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':origin+'/#organization',name:meta.name,url:origin+'/',logo:origin+meta.image},{'@type':'WebSite','@id':origin+'/#website',name:meta.name,url:origin+'/',inLanguage:'es-BO',publisher:{'@id':origin+'/#organization'}}]});document.head.append(script);}
    }
    if(visible&&!document.querySelector('link[rel="canonical"]')){const link=document.createElement('link');link.rel='canonical';link.href=origin+'/';document.head.append(link);}
  },[pathname,search,hash]);
}
