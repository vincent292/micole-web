import type { PGlite } from "@electric-sql/pglite";
// Existing academic/payment suites model schools whose initial funding has already
// settled and whose optional activation is enabled. Bank proof and immutable ledger
// are exercised separately in credit-pickup-demo-database.test.ts (all migrations).
export async function enableActivationFixture(db: PGlite) {
  await db.exec(
    "update aulanexo_private.platform_billing_settings set activation_enabled=true;update schools set activation_enabled=true",
  );
}
export async function fundInstitutionFixtures(db: PGlite) {
  await db.exec(
    "update aulanexo_private.platform_credit_accounts set initial_paid_at=now();update schools set platform_enabled=true;delete from platform_charges where kind='credit_topup'",
  );
}
