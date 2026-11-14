# MiCole web

## Explore only what the task needs

- When Serena is available, start with a scoped symbol overview or lookup; retrieve bodies only for relevant symbols. Follow references before changing shared contracts. Keep intermediate results inside its REPL and return a compact final expression.
- Use `rg` for filenames and literals, and narrow reads for SQL, CSS, JSON and configuration. Do not scan dependencies, generated output, caches or environment files.
- Start with Serena's `core` memory and follow only relevant memory links. Update notes only for durable conventions; avoid copying source or task transcripts into memory.
- Serena is optional: if unavailable, continue with scoped native tools. Never skip validation merely to reduce tokens.

## Source map and invariants

- `src/WorkspaceApp.tsx`: workspace shell, role-aware navigation; `src/lib/navigation.ts`: navigation helpers.
- `src/features/`: feature screens; `src/components/UI.tsx`: shared controls; `src/lib/`: hooks, domain logic and types.
- `src/styles/`: styles. Preserve the existing palette and institutional branding unless explicitly asked to change them.
- `supabase/migrations/`: append-only database changes. Preserve institution isolation, role permissions and historical student records. Load the relevant database skills before database work.
- Android/iOS use a separate Expo checkout; web edits do not automatically update mobile.

## Validate proportionately

- Inspect `package.json` for current commands. Use focused Vitest tests for changed behavior; `npm run test` covers the configured suite. Use `npm run build` for application changes and Playwright for relevant visual/interaction changes.
- Tooling-only changes need configuration and integration checks, not unrelated application rewrites or deployments.
- Never include credentials, private student data or generated Serena caches in commits.
