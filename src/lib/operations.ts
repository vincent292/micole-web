import type { Charge } from "./types";
export const bolivianCities = ["La Paz", "El Alto", "Santa Cruz de la Sierra", "Cochabamba", "Sucre", "Oruro", "Potosí", "Tarija", "Trinidad", "Cobija", "Montero", "Quillacollo", "Sacaba", "Riberalta", "Yacuiba", "Viacha", "Warnes", "Tiquipaya", "Vinto", "Villazón", "Tupiza", "Llallagua", "Guayaramerín", "Camiri", "San Ignacio de Velasco", "Achocalla", "Cotoca", "Patacamaya", "Caranavi", "Otros municipios"];
export const chargeBalance = (charge: Pick<Charge,"amount"|"paidAmount"|"status">) => charge.status === "paid" || charge.status === "cancelled" ? 0 : Math.max(0, Math.round(charge.amount * 100) - Math.round((charge.paidAmount || 0) * 100)) / 100;
export const chargeAccessMinimum = (charge: Charge) => Math.ceil(Math.round(charge.amount * 100) * (charge.minimumAccessRatio ?? 1)) / 100;
export function monthCount(from: string, to: string) {
 if (!/^\d{4}-\d{2}$/.test(from) || !/^\d{4}-\d{2}$/.test(to)) return 0;
 const [fy,fm] = from.split('-').map(Number), [ty,tm] = to.split('-').map(Number);
 return (ty-fy)*12+tm-fm+1;
}
export function whatsappLink(phone: string, message: string) {
 let digits = phone.replace(/\D/g, "");
 if (digits.length === 8) digits = `591${digits}`;
 if (digits.length < 10 || digits.length > 15) throw new Error("Escribe el celular con código de país, por ejemplo +591 70000000.");
 return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}
export function validateMapsUrl(value: string) {
 const raw = value.trim();
 if (!raw) return "";
 const text = raw.startsWith("<iframe") ? raw.match(/src=["']([^"']+)["']/i)?.[1] || "" : raw;
 try {
  const url=new URL(text);
  if (url.protocol!=="https:" || url.username || url.password || text.length>4096 || /[\s<>"']/.test(text) || !((url.hostname==="www.google.com" && url.pathname.startsWith("/maps")) || url.hostname==="maps.google.com" || url.hostname==="maps.app.goo.gl")) throw new Error();
  return text;
 } catch {throw new Error("Pega un enlace de Google Maps o el código de Insertar un mapa.");}
}
