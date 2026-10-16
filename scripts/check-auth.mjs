import { environment, reportFailure } from "./database.mjs";
environment();
try {
 const base = process.env.VITE_SUPABASE_URL?.trim();
 const key = process.env.VITE_SUPABASE_PUBLISHABLE_KEY?.trim();
 if (!base || !key) throw new Error("Configura la URL y la clave pública de Supabase.");
 const settingsResponse = await fetch(`${base}/auth/v1/settings`,{ headers:{apikey:key},signal:AbortSignal.timeout(15000) });
 if (!settingsResponse.ok) throw new Error("No se pudo consultar la configuración de Auth.");
 const settings = await settingsResponse.json();
 let googleRedirectReady = false;
 if (settings.external?.google === true) {
  const response=await fetch(`${base}/auth/v1/authorize?provider=google&redirect_to=${encodeURIComponent("http://localhost:5173/auth/callback")}`,{headers:{apikey:key},redirect:"manual",signal:AbortSignal.timeout(15000)});
  const location=response.headers.get("location");
  if(location){const target=new URL(location);googleRedirectReady=target.hostname==="accounts.google.com" && !!target.searchParams.get("client_id") && target.searchParams.get("redirect_uri")===`${base}/auth/v1/callback`;}
 }
 console.log(JSON.stringify({ok:settings.mailer_autoconfirm===false && (settings.external?.email===true || googleRedirectReady),googleEnabled:settings.external?.google===true,googleRedirectReady,emailEnabled:settings.external?.email===true,emailConfirmationRequired:settings.mailer_autoconfirm===false,googleCallback:`${base}/auth/v1/callback`,appCallback:"http://localhost:5173/auth/callback",note:"Comprobación de configuración; el ingreso completo requiere elegir una cuenta Google en el navegador."}));
} catch(error) {reportFailure(error);}
