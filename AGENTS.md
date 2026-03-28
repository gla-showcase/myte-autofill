# AGENTS.md

This file is the primary instruction entrypoint for AI agents working in this repository.

## Overview

MyTE Autofill Helper is a small Manifest V3 browser extension for Accenture MyTE.

- Runtime: browser-only
- Stack: plain JavaScript, HTML, CSS
- Build step: none
- Primary target: Chrome Web Store
- Secondary note: Edge compatibility may be mentioned when accurate, but Edge Store publication is not complete

Use [README.md](README.md) for product-facing usage and packaging details. Use [.github/instructions/myte-extension.instructions.md](.github/instructions/myte-extension.instructions.md) for file-level working rules on the extension sources.

## Quick Commands

- Install dev dependencies: `npm install`
- Unit and logic tests: `npm test`
- Watch tests: `npm run test:watch`
- Coverage: `npm run test:coverage`
- Playwright smoke tests: `npm run test:smoke`
- Playwright smoke tests, headed: `npm run test:smoke:headed`
- Playwright smoke tests, UI: `npm run test:smoke:ui`
- Open Playwright report: `npm run test:smoke:report`
- Bump version: `./scripts/bump-version.ps1 -Version X.Y.Z`
- Package Chrome release zip: `./scripts/package-chrome.ps1`

## Project Map

- [manifest.json](manifest.json): MV3 manifest and authoritative release version
- [background.js](background.js): service worker; keep it thin
- [content.js](content.js): main content script and primary implementation surface
- [panel.html](panel.html): fetched panel template
- [styles.css](styles.css): panel styling and theme variables
- [tests](tests): Vitest and Playwright coverage for logic, DOM behavior, and smoke flows
- [scripts](scripts): release and packaging scripts

## Working Rules

Use [.github/instructions/myte-extension.instructions.md](.github/instructions/myte-extension.instructions.md) as the authoritative file-scoped ruleset for extension sources and repo markdown.

At a repo level, keep these constraints in mind:

- Plain JavaScript, HTML, and CSS only unless the user explicitly asks otherwise.
- Preserve Manifest V3 compatibility and keep permissions changes conservative.
- Keep the panel/template lifecycle and existing DOM automation patterns intact.
- Keep stored configuration compact in `chrome.storage.sync`.

## Critical Implementation Patterns

- MyTE uses ag-Grid virtualization. Materialize rows before scraping popup results; incomplete scrolling produces incomplete WBS lists.
- MyTE reacts best to simulated user input. Prefer existing event-dispatch helpers over direct DOM mutation so Angular-style validation runs.
- Timing matters. Preserve the existing async and wait-based approach for DOM updates rather than replacing it with brittle shortcuts.
- Guard panel creation against duplicate or concurrent initialization. The panel template is loaded asynchronously.
- WBS search text is transient UI state, not persisted config.
- `chrome.storage.sync` has quota limits. Large WBS lists can approach them.

## Testing Notes

- Vitest covers logic and jsdom-based DOM behavior.
- Playwright smoke tests run the real content script in Chromium against a fake MyTE page.
- Use manual testing on the live site after meaningful DOM automation changes.
- Test entrypoints and examples live in [tests](tests), [playwright.config.js](playwright.config.js), and [.github/workflows/test.yml](.github/workflows/test.yml).

## Release Notes

- `manifest.json` is the release baseline.
- Local packaging flows through [scripts/package-chrome.ps1](scripts/package-chrome.ps1).
- Release checklist and notes template live in [.github/CHROME_STORE_RELEASE_TEMPLATE.md](.github/CHROME_STORE_RELEASE_TEMPLATE.md).
- CI packaging and release flows live in [.github/workflows/package-chrome.yml](.github/workflows/package-chrome.yml) and [.github/workflows/release-chrome.yml](.github/workflows/release-chrome.yml).

## Specialized Agents

- [Chrome Extension MV3 Developer](.github/agents/chrome-extension-mv3-developer.agent.md): use for `manifest.json`, `background.js`, `content.js`, DOM automation, panel behavior, and MV3 runtime debugging.
- [Chrome Web Store Release Manager](.github/agents/chrome-web-store-release.agent.md): use for version bumps, packaging, release notes, store-readiness checks, and Chrome Web Store submission prep.

## Related Instructions

- File-scoped rules: [.github/instructions/myte-extension.instructions.md](.github/instructions/myte-extension.instructions.md)
- Release checklist: [.github/CHROME_STORE_RELEASE_TEMPLATE.md](.github/CHROME_STORE_RELEASE_TEMPLATE.md)

## Suggested Prompts

- "Implement a new WBS search behavior in the panel without adding any framework."
- "Debug why WBS extraction misses rows from the popup grid."
- "Add Vitest coverage for the panel lifecycle in content.js."
- "Prepare the next Chrome package and summarize the release notes impact."