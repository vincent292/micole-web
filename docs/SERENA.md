# Serena for MiCole

Serena provides local TypeScript symbol lookup, references and persistent project notes. It helps reduce unnecessary source retrieval; it does not guarantee a fixed token saving or replace tests.

The web project is `micole-web`. The separate Expo checkout is `micole-mobile` and serves Android and iOS. Both have `.serena/project.yml`; caches and machine overrides remain ignored. Neither configuration changes the running apps.

This Mac has `serena-agent==2.1.0` installed through uv with an isolated Python 3.13 runtime. Codex's user MCP configuration starts it with the `codex` context and REPL interface. Existing MCP settings are preserved. Restart or reconnect Codex after adding the server; tools may not appear in an already running conversation.

## Daily use

1. Activate the relevant checkout. Begin with the `core` memory, then read only the notes relevant to the task.
2. Request scoped symbol overviews, definitions and references. Keep intermediate objects inside the REPL; return only useful names, locations or bodies using the final expression.
3. Use native `rg` and narrow reads for literals and non-TypeScript files. Validate the change normally.

Dependencies, builds, environment files, signing files and generated native directories are excluded from Serena's exploration. This reduces noise; it is not a filesystem security boundary.

## Another machine or maintenance

Install uv and run `uv tool install --python 3.13 serena-agent==2.1.0`. Register the executable in Codex with `serena start-mcp-server --context codex --project /absolute/path/to/micole-app --agent-interface repl`. Use the absolute executable path if its directory is outside PATH. Do not copy another machine's complete Codex config or private backup.

From each checkout, `serena project index .` warms the local index; subsequent edits are handled by the language server. `serena memories check` checks memory links. Keep notes brief and update them when architecture changes. Do not commit `.serena/cache/`, logs or `project.local.yml`.

To disconnect, remove only the `serena` MCP entry from Codex and reconnect. Its installation and caches are development tooling, not production dependencies.
