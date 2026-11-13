import {expect,it} from 'vitest';
import {navigationGroups,organizeNavigation} from '../src/lib/navigation';
it('places Resumen first and groups academic and financial tools without removing access',()=>{
 const items=['bolivia','timetables','overview','students','centralizers','cash','enrollment'].map(key=>({key,label:key,group:'TU ESPACIO'}));
 for(const role of ['director','scheduler'] as const){
   const result=organizeNavigation(items,role);
   expect(result[0].key).toBe('overview');expect(result[0].label).toBe('Resumen');
   expect(result.find(item=>item.key==='cash')?.group).toBe('ECONOMÍA');
   expect(result.find(item=>item.key==='students')?.group).toBe('GESTIÓN ACADÉMICA');
   expect(result.map(item=>item.key).sort()).toEqual(items.map(item=>item.key).sort());
   expect(navigationGroups(role)[0]).toBe('INICIO');
 }
 expect(items[0].group).toBe('TU ESPACIO');
 expect(organizeNavigation(items,'teacher')[0].key).toBe('overview');
});
