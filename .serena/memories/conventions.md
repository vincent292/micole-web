# Conventions
- Keep feature/hook/shared-control boundaries; shared forms in src/components/UI.tsx.
- Scope to institution and role; preserve student history and palette/branding.
- New schema changes use new migrations; read database skills first.
- Scoped symbol queries for TypeScript, rg for literals, narrow non-code reads. Keep REPL intermediates local; return a compact final expression.
- No secrets, student data or transcripts in memories.
