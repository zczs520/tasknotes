# Local plugin validation

Use this workflow when validating changes that affect plugin behavior or styles.

## Build and deploy

1. Verify the source plugin ID is `taskquence` and the destination is `C:\Users\MK\Desktop\插件测试仓库\.obsidian\plugins\taskquence`, whose manifest must also identify `taskquence`.
2. Run `npm run build:test`. It runs the production build and `copy-files.mjs`, copying `main.js`, `styles.css`, and `manifest.json`. The script rejects other destinations and mismatched plugin IDs. Do not bypass these checks to accommodate a stale local override.
3. Verify the deployed artifact hashes against the source artifacts.
4. Reload TaskNotes Time in the test vault and inspect the affected behavior and runtime errors.

## Reload and inspect

Obsidian must be running. Check whether the CLI is available and confirm that the selected vault resolves to `C:\Users\MK\Desktop\插件测试仓库` before using it. Do not assume the historical alias `test` identifies this vault.

With the vault name verified, use these PowerShell commands as needed:

```powershell
obsidian 'vault=插件测试仓库' plugin:reload id=taskquence
obsidian 'vault=插件测试仓库' dev:errors
obsidian 'vault=插件测试仓库' dev:console
obsidian 'vault=插件测试仓库' eval code="app.vault.getFiles().length"
obsidian 'vault=插件测试仓库' dev:screenshot path=screenshot.png
obsidian 'vault=插件测试仓库' devtools
```

Do not use `computer-use` or Windows app-control tools for this project. If the CLI is unavailable or cannot reliably select the test vault, ask the user to manually disable/enable TaskNotes Time or restart the test-vault instance, and state the behavior to verify. Complete independent checks first. Never fall back to the personal vault or force-terminate Obsidian.

## Available checks

- `npm test -- <test selection>`: affected Jest tests.
- `npm test`: full Jest suite.
- `npm run lint`: repository lint checks.
- `npm run typecheck`: TypeScript checking.
- `npm run build`: production build without deployment.
- `npm run build:test`: production build and test-vault deployment.

Select checks for the change; do not rebuild or deploy for documentation-only, instruction-only, or test-only edits. Full release validation is specified in [Release workflow](agent-release-workflow.md).
