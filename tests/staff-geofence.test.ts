import { it, expect } from "vitest";
import {
  staffDistance,
  staffLocationEligibility,
} from "../src/lib/staffGeofence";
const now = Date.parse("2026-10-22T12:00:00Z"),
  settings = {
    arrival_enabled: true,
    latitude: -16.5,
    longitude: -68.1,
    radius_m: 150,
    max_accuracy_m: 50,
  },
  point = {
    latitude: -16.5,
    longitude: -68.1,
    accuracy: 10,
    capturedAt: new Date(now).toISOString(),
  };
it("desactiva las marcaciones por sede incluso con una ubicación válida", () => {
  expect(
    staffLocationEligibility(point, { ...settings, arrival_enabled: false }, now),
  ).toMatchObject({
    allowed: false,
    message: expect.stringContaining("desactivado"),
  });
  expect(
    staffLocationEligibility(undefined, { ...settings, arrival_enabled: false }, now),
  ).toMatchObject({
    allowed: false,
    message: expect.stringContaining("desactivado"),
  });
  expect(staffLocationEligibility(point, null, now)).toMatchObject({
    allowed: false,
    message: expect.stringContaining("opcional"),
  });
  expect(staffLocationEligibility(point, settings, now).allowed).toBe(true);
});
it("habilita la marcación solo con ubicación precisa y reciente dentro del rango", () => {
  expect(staffLocationEligibility(point, settings, now)).toMatchObject({
    allowed: true,
    distance: 0,
  });
  expect(staffLocationEligibility(undefined, settings, now).allowed).toBe(
    false,
  );
  expect(staffLocationEligibility(point, null, now).allowed).toBe(false);
  expect(
    staffLocationEligibility({ ...point, latitude: -16.51 }, settings, now),
  ).toMatchObject({ allowed: false });
});
it("rechaza ubicación vencida, futura, simulada, inválida o imprecisa", () => {
  for (const changed of [
    { capturedAt: new Date(now - 90001).toISOString() },
    { capturedAt: new Date(now + 90001).toISOString() },
    { capturedAt: "invalid" },
    { mocked: true },
    { accuracy: 51 },
    { accuracy: -1 },
    { accuracy: NaN },
    { latitude: Infinity },
    { longitude: 181 },
    { latitude: 91 },
  ])
    expect(
      staffLocationEligibility({ ...point, ...changed }, settings, now).allowed,
    ).toBe(false);
  expect(
    staffLocationEligibility(
      { ...point, capturedAt: new Date(now - 90000).toISOString() },
      settings,
      now,
    ).allowed,
  ).toBe(true);
});
it("separa sedes y calcula distancia en metros, sin inventar asistencia", () => {
  expect(
    staffDistance(point, { latitude: -16.501, longitude: -68.1 }),
  ).toBeCloseTo(111.195, 1);
  expect(
    staffLocationEligibility(point, { ...settings, latitude: -17.5 }, now)
      .allowed,
  ).toBe(false);
  expect(
    staffLocationEligibility({ ...point, accuracy: 50 }, settings, now).allowed,
  ).toBe(true);
});
