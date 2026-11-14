# Toolchain
- React/TypeScript + Vite; exact versions in package.json and lockfile.
- Shared Supabase backend boundary src/lib/supabase.ts; hooks src/lib/; append-only supabase/migrations/.
- Vitest domain/database-contract tests; Playwright browser tests. Native is a separate Expo checkout.
