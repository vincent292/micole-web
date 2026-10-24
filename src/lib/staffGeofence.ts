import type { StaffLocation, StaffSettings } from "./staff";
export function staffDistance(
  a: { latitude: number; longitude: number },
  b: { latitude: number; longitude: number },
) {
  const rad = (v: number) => (v * Math.PI) / 180,
    dlat = rad(b.latitude - a.latitude),
    dlon = rad(b.longitude - a.longitude),
    h =
      Math.sin(dlat / 2) ** 2 +
      Math.cos(rad(a.latitude)) *
        Math.cos(rad(b.latitude)) *
        Math.sin(dlon / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, Math.max(0, h))));
}
export function staffLocationEligibility(
  point: StaffLocation | undefined,
  settings:
    | Pick<
        StaffSettings,
        "arrival_enabled" | "latitude" | "longitude" | "radius_m" | "max_accuracy_m"
      >
    | null
    | undefined,
  now = Date.now(),
): { allowed: boolean; message: string; distance?: number } {
  if (!settings || settings.arrival_enabled !== true)
    return {
      allowed: false,
      message:
        "El control de llegada está desactivado en esta sede. Dirección puede habilitarlo de forma opcional.",
    };
  if (!point)
    return {
      allowed: false,
      message: "Verifica tu ubicación para habilitar la marcación.",
    };
  if (
    ![
      point.latitude,
      point.longitude,
      point.accuracy,
      settings.latitude,
      settings.longitude,
      settings.radius_m,
      settings.max_accuracy_m,
    ].every(Number.isFinite) ||
    Math.abs(point.latitude) > 90 ||
    Math.abs(point.longitude) > 180 ||
    point.accuracy < 0 ||
    settings.radius_m < 1 ||
    settings.max_accuracy_m < 0 ||
    point.mocked
  )
    return {
      allowed: false,
      message:
        "Se necesita una ubicación GPS válida. No se aceptan ubicaciones simuladas.",
    };
  const distance = staffDistance(point, settings),
    stamp = Date.parse(point.capturedAt);
  if (!Number.isFinite(stamp) || Math.abs(now - stamp) > 90000)
    return {
      allowed: false,
      distance,
      message: "La ubicación venció. Verifícala de nuevo antes de marcar.",
    };
  if (point.accuracy > settings.max_accuracy_m)
    return {
      allowed: false,
      distance,
      message: `El GPS tiene una precisión de ${Math.ceil(point.accuracy)} m; se requiere ${settings.max_accuracy_m} m o mejor. Intenta cerca de una ventana o al aire libre.`,
    };
  if (distance > settings.radius_m)
    return {
      allowed: false,
      distance,
      message: `Estás a ${Math.round(distance)} m de la sede, fuera del rango de ${settings.radius_m} m.`,
    };
  return {
    allowed: true,
    distance,
    message: `Dentro del rango: ${Math.round(distance)} m de la sede · precisión ${Math.ceil(point.accuracy)} m.`,
  };
}
