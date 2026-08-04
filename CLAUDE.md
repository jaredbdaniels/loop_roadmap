# CLAUDE.md

Claude Code specific instructions for this project.

## Primary Documentation

**Read `AGENTS.md` first** — it describes the tech stack, patterns, and scripts.

## Development Workflow

This project uses the `campco-product` Claude Code plugin for its workflow skills, domain skills, and MCP servers. Make sure the plugin is installed:

```
/plugin install campco-product@campminder-product
```

Once installed, you have access to:

- **Workflow loop**: `/brainstorm`, `/plan`, `/work`, `/review`, `/compound`
- **Domain skills**: `frontend-design`, `database-designer`, `api-route-builder`, `feature-builder`, `code-reviewer`, `tdd-workflow`, and more
- **MCP servers**: shadcn, context7, playwright, figma
- **Slash commands**: `/commit`, `/commit-push-pr`, `/deploy`, `/logs`, `/setup-vercel`

## Rules

- Use the workflow loop for any non-trivial feature work
- Always run `npm run lint && npm run typecheck` after changes
- Filter user-specific DB queries appropriately when adding auth
- Never commit secrets; `.env.local` is gitignored
