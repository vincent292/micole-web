import {test,expect} from '@playwright/test';
test('saldo y cubierto incluyen abonos parciales',async({page})=>{
 await page.goto('/');
 await page.getByLabel('Correo de acceso',{exact:true}).fill('invitado@example.test');
 await page.getByLabel('Clave de acceso',{exact:true}).fill('AccesoLocalSoloPruebas!');
 await page.getByRole('button',{name:'Entrar a la demo',exact:true}).click();
 await page.getByRole('combobox',{name:'Rol de demostración'}).selectOption('guardian');
 await page.evaluate(()=>{
  const key='micole_public_demo_v1',d=JSON.parse(localStorage.getItem(key)!);
  d.platformCharges=[];
  d.charges=[{id:'audit-partial',schoolId:'s1',studentId:'a1',concept:'Cuota parcial',dueDate:'2026-10-01',amount:500,paidAmount:200,status:'pending'}];
  localStorage.setItem(key,JSON.stringify(d));
 });
 await page.goto('/app/payments');
 await expect(page.locator('.stat-card').filter({hasText:'Saldo pendiente'})).toContainText('300');
 await expect(page.locator('.stat-card').filter({hasText:'Importe cubierto'})).toContainText('200');
});
