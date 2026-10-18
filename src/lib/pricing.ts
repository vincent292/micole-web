import { rpc } from "./repository";
import { liveMode } from "./supabase";
export interface PlatformTariffs {
  schoolId?: string | null;
  activationFee: number;
  monthlyLicenseFee: number;
  inherited: boolean;
  updatedAt?: string;
}
export const defaultTariffs: PlatformTariffs = {
  activationFee: 50,
  monthlyLicenseFee: 29,
  inherited: true,
};
export function parseTariffs(value: unknown): PlatformTariffs {
  const row = value as PlatformTariffs;
  if (
    !row ||
    !Number.isFinite(Number(row.activationFee)) ||
    Number(row.activationFee) <= 0 ||
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
