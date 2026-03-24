---
applyTo: "manifest.json,background.js,content.js,panel.html,styles.css,README.md,.github/agents/*.agent.md,.github/*.md"
---

# MyTE Extension Working Rules

This repository is a small Manifest V3 browser extension shipped without a build step.

## Architecture

- Keep the project in plain JavaScript, HTML, and CSS.
- Do not introduce bundlers, frameworks, or TypeScript unless explicitly requested.
- Keep content-script logic centralized in `content.js` unless there is a strong reason to split it.
- Treat `panel.html` as a fetched template and preserve the current panel lifecycle pattern.
- Prefer `chrome.storage.sync` for user configuration and keep stored data compact.

## MV3 Constraints

- Preserve Manifest V3 compatibility when editing `manifest.json`, background logic, or content script wiring.
- Be conservative with new permissions, host permissions, and web-accessible resources.
- When automating MyTE interactions, keep using user-event simulation patterns so the page registers changes correctly.
- Timing-sensitive DOM changes should continue to use the existing async/wait approach rather than introducing brittle shortcuts.

## UI And Styling

- Reuse existing panel structure and CSS custom properties instead of adding inline styles.
- Keep the embedded panel practical and compact; this is an in-page utility, not a standalone website.
- Preserve the current Corporate and Developer theme approach.

## Logging And Feedback

- Prefix console messages with `[MyTE]`.
- Prefer `showToast(message, type)` for non-blocking feedback.
- Reserve blocking alerts for real error conditions only.

## Release Rules

- The `manifest.json` version is the authoritative release baseline for packaging and tagging.
- Treat Chrome Web Store publishing as the primary supported store workflow.
- Edge compatibility may be mentioned when accurate, but do not claim Edge Store publication is complete.
- Release packaging should include only the files needed by the extension and should exclude workspace-only artifacts.
- When preparing a release, keep notes and checklists aligned with the actual shipped changes.

## Documentation

- Keep README permission and packaging details synchronized with the manifest.
- If a change affects release packaging or store review risk, document it clearly.