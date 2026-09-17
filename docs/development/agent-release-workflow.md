# Release workflow

Read this document when preparing or publishing a TaskNotes Time release.

## Authorization

Preparing a release does not by itself authorize publication. Publish only after the user explicitly confirms testing passed in `C:\Users\MK\Desktop\插件测试仓库` or explicitly asks to release/publish the tested changes. Automated checks alone are insufficient. Once authorized, complete the publishing workflow without repeatedly requesting the same approval.

## Prepare

1. Choose the next semantic version unless specified: patch for fixes and small compatible changes, minor for backward-compatible features, major for breaking changes.
2. Follow [I18N_GUIDE.md](../../I18N_GUIDE.md); ensure translations are current and in their target languages, without English placeholders.
3. Review `docs/releases/unreleased.md` for concise, user-facing wording without marketing copy. For linked issues and PRs, inspect their threads and verify acknowledgements of the opener and relevant contributors, including commenters who helped resolve the issue. Do not thank `callumalpass` in release entries.
4. If the repository uses the `.ops` / Pickle issue-closeout workflow and this release includes tracked open issues, update matching local draft comments, close reasons, and requests. Inspect each relevant issue individually, create/update/cancel matching requests as appropriate, and validate `.ops` and `.ops/_pickle` using the configured tooling. Do not invent a missing workflow or commit `.ops`. Sending comments or closing issues requires user authorization.
5. Move the user-facing unreleased contents to `docs/releases/<VERSION>.md`, following previous releases, and leave the instructional comments in `unreleased.md`.
6. Update `manifest.json`, `package.json`, `package-lock.json`, and `versions.json` consistently. The tag must equal the manifest version with no `v` prefix.
7. Run `npm run i18n:sync` and `npm run docs:sync`. Review generated changes, then run the full tests (`npm test`), `npm run lint`, `npm run typecheck`, and `npm run build`. Fix failures caused by the release; do not weaken checks or describe failing checks as passing.
8. Complete applicable [test-vault validation](agent-local-validation.md). Keep user testing confirmation distinct from automated verification.

## Publish when authorized

1. Review the release diff, exclude `.ops` and unrelated local changes, and commit the release as `release <VERSION>`.
2. Push the verified default branch to GitHub. Create tag `<VERSION>` on the release commit and push it so the GitHub Actions release workflow publishes the release.
3. Confirm the workflow succeeds and the GitHub Release contains `main.js`, `manifest.json`, and `styles.css`. Report the release URL and any remaining failure accurately.

Public distribution uses the GitHub Release. After publishing, all local deployment remains restricted to the test vault; do not copy release files into the personal vault unless the user explicitly changes that rule.
