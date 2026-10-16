import {describe,expect,it} from 'vitest';
import {chargeAccessMinimum,chargeBalance,monthCount,validateMapsUrl,whatsappLink} from '../src/lib/operations';
import {realtimeCollections} from '../src/lib/realtime';
import {reportTotals} from '../src/lib/reports';
describe('importes y cambios de operación',()=>{
 it('calcula abonos en centavos y redondea el mínimo hacia arriba',()=>{
  expect(chargeBalance({amount:100.01,paidAmount:50.01,status:'pending'})).toBe(50);
  expect(chargeAccessMinimum({amount:100.01,minimumAccessRatio:.5} as any)).toBe(50.01);
  expect(chargeAccessMinimum({amount:1.10,minimumAccessRatio:1} as any)).toBe(1.10);
  expect(chargeBalance({amount:100,paidAmount:200,status:'pending'})).toBe(0);
 });
 it('conserva emisión bruta y descuenta abonos de pendientes en reportes',()=>{
  const result=reportTotals({charges:[{amount:100,paidAmount:50,status:'overdue'} as any],payments:[{amount:50} as any]});
  expect(result).toEqual({issued:100,collected:50,outstanding:50,overdue:50});
 });
 it('valida Google Maps y enlaces manuales de WhatsApp',()=>{
  expect(validateMapsUrl('<iframe src="https://www.google.com/maps/embed?pb=test"></iframe>')).toBe('https://www.google.com/maps/embed?pb=test');
  for(const url of ['javascript:alert(1)','https://www.google.com.evil.org/maps','https://user:pass@www.google.com/maps','https://evil.org/'])expect(()=>validateMapsUrl(url)).toThrow();
  expect(whatsappLink('70000000','Importe Bs 100')).toContain('https://wa.me/59170000000?text=Importe%20Bs%20100');
  expect(monthCount('2026-10','2027-03')).toBe(6);
 });
 it('Realtime actualiza solo las colecciones necesarias y reconstruye permisos al cambiar pagos',()=>{
  expect(realtimeCollections(['messages','notifications'])).toEqual(['notifications','auditEvents','messages']);
  expect(realtimeCollections(['school_payments'])).toBeUndefined();
  expect(realtimeCollections(['students'])).toBeUndefined();
 });
});
