# MiCole web map
- Shell/navigation: `src/WorkspaceApp.tsx`, `src/lib/navigation.ts`.
- Screens: `src/features/`; shared controls: `src/components/UI.tsx`; hooks/domain types: `src/lib/`; styles: `src/styles/`.
- Deferred workspace screens: `src/features/lazyWorkspaceFeatures.ts`; composed load/error handling: `src/components/FeatureBoundary.tsx`. Frontend conventions: `docs/FRONTEND.md`.
- Database: `supabase/migrations/` (append-only), shared with separate mobile checkout.
- Preserve institution isolation, roles, student history and branding.
- Toolchain: `mem:tech_stack`; editing rules: `mem:conventions`; development commands: `mem:suggested_commands`; validation: `mem:task_completion`.
