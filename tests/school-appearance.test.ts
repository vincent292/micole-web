import {it,expect} from 'vitest';
import {appearanceFor,institutionTemplates,parseAppearance,readableInk,schoolAppearanceStyle} from '../src/lib/schoolAppearance';
it('incluye cinco plantillas con identidades y composición propias',()=>{expect(new Set(institutionTemplates.map(t=>t.id)).size).toBe(5);for(const t of institutionTemplates)expect(parseAppearance(appearanceFor(t.id))?.template).toBe(t.id);});
it('rechaza valores CSS arbitrarios y textos excesivos, descartando propiedades extra',()=>{expect(parseAppearance({...appearanceFor('aurora'),primary:'red;display:none'})).toBeUndefined();expect(parseAppearance({...appearanceFor('aurora'),welcome:'x'.repeat(141)})).toBeUndefined();expect(parseAppearance({...appearanceFor('aurora'),css:'body{}'})).not.toHaveProperty('css');});
it('elige texto legible para colores claros y oscuros',()=>{expect(readableInk('#FFFFFF')).toBe('#14242E');expect(readableInk('#000000')).toBe('#FFFFFF');expect(readableInk('#FFFF00')).toBe('#14242E');});
it('mantiene sin estilos institucionales a los colegios que no participan',()=>{expect(schoolAppearanceStyle()).toEqual({});});

it('mantiene contraste en colores intermedios donde el blanco no alcanza',()=>{expect(readableInk('#777777')).toBe('#000000');});
