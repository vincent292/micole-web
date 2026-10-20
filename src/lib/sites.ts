import type { School } from './types';
export const educationLevels=['Guardería','Inicial','Primaria','Secundaria','Educación especial','Otros'];
export interface SiteDirectory {
 institutionId:string;canManage:boolean;billing:'per_site';
 sites:{school:Record<string,unknown>;students:number;directors:{email:string;name:string;inherited:boolean;active:boolean}[];invitations:{id:string;email:string;expiresAt:string}[]}[];
}
export function schoolGroup(s:School){return s.institutionId||s.id;}
export function siteLabel(s:School){return `${s.name} · ${s.siteName||'Sede principal'}`;}
