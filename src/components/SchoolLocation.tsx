import { useState } from "react";
import { MapPin } from "lucide-react";
import { Button } from "./UI";
import type { School } from "../lib/types";
export function SchoolLocation({school}:{school:School}) {
 const [visible,setVisible]=useState(false);
 const query=[school.address,school.city,'Bolivia'].filter(Boolean).join(', ');
 const key=import.meta.env.VITE_GOOGLE_MAPS_EMBED_KEY as string|undefined;
 const embed=school.mapsUrl?.startsWith('https://www.google.com/maps/embed')?school.mapsUrl:key?`https://www.google.com/maps/embed/v1/place?key=${encodeURIComponent(key)}&q=${encodeURIComponent(query)}`:'';
 if(!school.mapsUrl&&!school.address)return null;
 return <div className="school-location"><div className="request-actions"><a className="btn btn-secondary" href={school.mapsUrl||`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`} target="_blank" rel="noopener noreferrer"><MapPin size={17}/>Abrir en Google Maps</a>{embed&&<Button variant="ghost" onClick={()=>setVisible(!visible)}>{visible?'Ocultar mapa':'Ver mapa'}</Button>}</div>{visible&&embed&&<iframe title={`Ubicación de ${school.name}`} src={embed} loading="lazy" referrerPolicy="no-referrer-when-downgrade" allowFullScreen className="institution-map"/>}</div>;
}
