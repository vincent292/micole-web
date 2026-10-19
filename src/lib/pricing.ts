import { rpc } from "./repository";
import { liveMode } from "./supabase";
export interface PlatformTariffs {
  schoolId?: string | null;
  activationFee: number;
  activationEnabled?: boolean;
  configuredActivationFee?: number;
  initialCredit?: number;
  monthlyLicenseFee: number;
  inherited: boolean;
  updatedAt?: string;
}
export const defaultTariffs: PlatformTariffs = {
  activationFee: 0,
  configuredActivationFee: 50,
  activationEnabled: false,
  initialCredit: 500,
  monthlyLicenseFee: 29,
  inherited: true,
};
export function parseTariffs(value: unknown): PlatformTariffs {
  const row = value as PlatformTariffs;
  if (
    !row ||
    !Number.isFinite(Number(row.activationFee)) ||
    Number(row.activationFee) < 0 ||
    !Number.isFinite(Number(row.monthlyLicenseFee)) ||
    Number(row.monthlyLicenseFee) <= 0
  )
    throw new Error(
      "No pudimos consultar las tarifas vigentes de MiCole. Vuelve a intentar.",
    );
  return {
    ...row,
    activationFee: Number(row.activationFee),
    monthlyLicenseFee: Number(row.monthlyLicenseFee),
  };
}
export async function loadTariffs(schoolId?: string | null) {
  return liveMode
    ? parseTariffs(
        await rpc("platform_tariffs", { p_school_id: schoolId || null }),
      )
    : defaultTariffs;
}

// Public landing requests must not inherit Auth or an active support session.
export async function loadPublicTariffs() {
  if (!liveMode) return defaultTariffs;
  const url = import.meta.env.VITE_SUPABASE_URL,
    key = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key)
    throw new Error("No pudimos consultar las tarifas vigentes de MiCole.");
  const response = await fetch(`${url.trim()}/rest/v1/rpc/platform_tariffs`, {
    method: "POST",
    credentials: "omit",
    headers: { apikey: key.trim(), "Content-Type": "application/json" },
    body: JSON.stringify({ p_school_id: null }),
  });
  if (!response.ok)
    throw new Error(
      "No pudimos consultar las tarifas vigentes de MiCole. Vuelve a intentar.",
    );
  return parseTariffs(await response.json());
}

export const platformBalance=(charge:{amount:number;status:string;creditApplied?:number})=>["paid","cancelled"].includes(charge.status)?0:Math.max(0,Math.round((charge.amount-(charge.creditApplied||0))*100)/100);
