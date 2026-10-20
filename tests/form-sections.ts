import type { Page } from "@playwright/test";
export async function showFormSection(page: Page, label: string) {
  const nav = page.getByRole("navigation", {
    name: "Secciones del formulario",
  });
  if (!(await nav.count())) return;
  let title = "";
  if (
    /Alergias$|Alimentos que|Condiciones de salud|Indicaciones de cuidado/.test(
      label,
    )
  )
    title = "Salud y alimentación";
  else if (/seguro|póliza/.test(label)) title = "Seguro";
  else if (/emergencia|Segundo contacto|Segundo teléfono/.test(label))
    title = "Emergencias";
  else if (/madre|padre|Alergias conocidas/i.test(label))
    title = "Madre y padre";
  else if (
    /NIT|Dirección de la institución|Teléfono de la institución|Sitio web|Google Maps/.test(
      label,
    )
  )
    title = "Contacto y ubicación";
  else if (
    /Carnet de Dirección|Celular de Dirección|Mostrar institución/.test(label)
  )
    title = "Dirección y publicación";
  else if (/Logo|logo|banner|portada/.test(label)) title = "Logo y portada";
  else if (
    /Nombres|Apellidos|Fecha de nacimiento|Aula|RUDE|CI del niño/.test(label)
  )
    title = "Estudiante";
  else if (
    /cuotas|Cuotas|Mensualidad|Merienda|Matrícula|vencimiento|Descuento|Prorratear/.test(
      label,
    )
  )
    title = "Plan de pagos";
  else if (
    /Nombre de la institución|Ciudad|directora|Color de marca/.test(label)
  )
    title = "Datos generales";
  if (title) {
    const button = nav.getByRole("button", { name: new RegExp(title + "$") });
    if (await button.count()) {
      for(let i=0;await button.isDisabled() && i<12;i++){
        const before=await nav.locator('[aria-current="step"]').innerText();
        await page.getByRole('dialog').getByRole('button',{name:'Siguiente',exact:true}).click();
        if(await nav.locator('[aria-current="step"]').innerText()===before) throw new Error('Completa el paso actual antes de abrir '+title);
      }
      await button.click();
    }
  }
}
