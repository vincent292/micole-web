import { test, expect } from '@playwright/test';

test('el teclado permanece en la ficha desde el foco inicial y permite recorrerla', async ({page}) => {
  await page.goto('/');
  await page.getByLabel('Correo de acceso', {exact:true}).fill('invitado@example.test');
  await page.getByLabel('Clave de acceso', {exact:true}).fill('AccesoLocalSoloPruebas!');
  await page.getByRole('button', {name:'Entrar a la demo',exact:true}).click();
  await page.getByRole('combobox', {name:'Rol de demostración'}).selectOption('director');
  await page.goto('/app/students');
  await page.getByRole('button', {name:/Inscribir alumno|Inscribir estudiante|Nuevo estudiante/}).first().click();
  const dialog=page.getByRole('dialog');
  await expect(dialog).toBeVisible();
  await dialog.focus();
  await page.keyboard.press('Shift+Tab');
  expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  for(let i=0;i<25;i++) {
    await page.keyboard.press('Tab');
    expect(await dialog.evaluate(node=>node.contains(document.activeElement))).toBe(true);
  }
});

test('Atrás y Adelante conservan la lista sin guardar dentro de la sesión', async ({page})=>{
 await page.goto('/');
 await page.getByLabel('Correo de acceso',{exact:true}).fill('invitado@example.test');
 await page.getByLabel('Clave de acceso',{exact:true}).fill('AccesoLocalSoloPruebas!');
 await page.getByRole('button',{name:'Entrar a la demo',exact:true}).click();
 await page.getByRole('combobox',{name:'Rol de demostración'}).selectOption('teacher');
 await page.locator('.sidebar').getByRole('button',{name:/Asistencia de alumnos/}).click();
 const first=page.locator('.attendance-row').first();
 await first.getByRole('combobox').selectOption('absent');
 await page.goBack();
 await expect(page).not.toHaveURL(/studentAttendance/);
 await page.goForward();
 await expect(first.getByRole('combobox')).toHaveValue('absent');
 await page.getByRole('button',{name:'Descartar cambios',exact:true}).click();
 await expect(first.getByRole('combobox')).not.toHaveValue('absent');
});
