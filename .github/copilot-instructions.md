# MyTE Autofill Helper — Copilot Instructions

## Project overview

Chrome/Edge extension (Manifest V3) that automates Accenture MyTE timesheet filling. Runs entirely in the browser — no backend, no build step, no bundler. Plain JavaScript, HTML, and CSS.

## Architecture

| File | Role |
|---|---|
| `manifest.json` | MV3 manifest — permissions, content script registration, service worker, `web_accessible_resources` |
| `background.js` | Service worker — listens for icon click, toggles panel or opens MyTE |
| `content.js` | Content script injected into `myte.accenture.com` — all UI logic, DOM automation, storage, and panel lifecycle |
| `panel.html` | HTML template for the in-page side panel (loaded via `fetch` + `web_accessible_resources`) |
| `styles.css` | Panel styling with CSS custom properties for corporate / dev themes |
| `icons/` | Extension icons (16/32/48/128 px) |

### Key patterns

- **No frameworks** — vanilla JS, DOM APIs, `chrome.*` APIs only.
- **User-event simulation** — the extension fills fields by dispatching real keyboard/mouse events (`click`, `keydown`, `input`, `change`) so the MyTE Angular app registers the changes. See `fillEditableDiv()`, `userSetCheckbox()`, `pressTab()`.
- **Config persistence** — `chrome.storage.sync` under key `myteAutofillConfig`. Config is a flat object with `dailyHours`, `weeklyPattern`, `wbsAllocations`, `availableWbs`, `favoriteWbs`, `autoCheckRest`, `themeStyle`.
- **Panel as template** — `panel.html` is fetched at runtime and cloned into the page DOM. Events are wired imperatively in `wirePanelEvents()`.
- **WBS extraction** — opens the MyTE charge-code popup, scrolls the ag-Grid virtual list, scrapes active rows, and closes the popup.

## Conventions

- **No build step** — files are loaded directly by Chrome. Do not introduce bundlers, transpilers, or TypeScript.
- **Single content script** — all content-script logic lives in `content.js`. Keep it in one file unless there's a strong reason to split.
- **CSS variables** — theme colours use `--myte-*` custom properties defined on `#myte-helper-panel`. Add new variables there, not inline colours.
- **Async/await** — preferred over raw Promises. Use `wait(ms)` helper for delays.
- **Console logging** — prefix with `[MyTE]`. Use `console.log` for informational, `console.warn`/`console.error` for problems.
- **User feedback** — use `showToast(message, type)` (info/success/error) for non-blocking messages. Reserve `alert()` for blocking errors only.

## Testing

No automated tests. Manual testing workflow:

1. Load the extension unpacked in `chrome://extensions` (enable Developer mode).
2. Navigate to `https://myte.accenture.com/#/time`.
3. Click the extension icon to toggle the panel.
4. Verify WBS loading, hour splitting, HW/Office pattern, and rest checkboxes.

## Common pitfalls

- MyTE uses **ag-Grid** with virtualised rows — you must scroll the viewport to materialise all rows before querying the DOM.
- Timing matters: DOM changes from simulated events may need `await wait(...)` before the next step.
- `chrome.storage.sync` has a quota (~102 KB total). Large WBS lists can hit limits.
- The extension only activates on `https://myte.accenture.com/*` — `host_permissions` in manifest must match.
