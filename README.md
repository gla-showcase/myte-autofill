# MyTE Autofill Helper

Autofill Accenture MyTE timesheets with multi-WBS allocations & HW/Office patterns.

![Chrome Web Store](https://img.shields.io/badge/Chrome_Extension-Available-blue?logo=googlechrome&logoColor=white)
![Edge Add-ons](https://img.shields.io/badge/Edge_Add--ons-Pending-blue?logo=microsoftedge&logoColor=white)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)
![Status](https://img.shields.io/badge/Status-Active-brightgreen)
![Version](https://img.shields.io/badge/Version-1.3.0-purple)

⚠️ This is an independent helper tool.  
It is **not** affiliated with, sponsored by, or endorsed by **Accenture** or the official **MyTE** product team.

---

## 🚀 Overview

**MyTE Autofill Helper** automates repetitive tasks inside the Accenture MyTE timesheet interface.  
It simulates real user actions to safely and reliably fill your timesheet—saving time and preventing mistakes.

Everything runs **locally in your browser**.  
No data is transmitted. No tracking. No servers.

If you log time every week or every half-month, this extension reduces the process from **minutes to seconds**.

---

## ✨ Features

### 🔢 Multi-WBS Hours Autofill

- Add multiple WBS codes with weighted percentages.
- Automatically splits your daily hours (default **7.7h**) based on these weights.
- Ensures **perfect rounding** and correct totals (last WBS adjusted).
- Simulates real typing + Tab validation in the grid.

### 📥 Automatic WBS Loading

The extension:

- Opens the MyTE WBS selection popup
- Scrolls through the entire virtualized list
- Extracts **only active (white) WBS**
- Ignores inactive or closed (red) WBS
- Saves them to a dropdown for easy selection

No more manual searching.  
No more guessing.  
Instant WBS filtering.

### 🏠🏢 Weekly Homeworking / Office Pattern

Configure your weekly rhythm once.  
For each weekday (Mon-Fri), choose:

- **Homeworking (🏠)**
- **Office/Client (🏢)**
- **None**

The extension then applies the pattern across all weeks automatically using user-simulated events.

### ✔️ Automatic Compliance Checkboxes

Optionally auto-check:

- "I have respected my daily rest"
- "I have respected my weekly rest"

Works **only** on valid working days (never weekends or special days).

### 🎨 Modern Embedded UI Panel

The in-page control panel features:

- Accenture-themed styles (**Corporate** and **Developer** modes)
- Dark/light mode support
- Foldable configuration categories
- Emoji indicators
- Fixed bottom action bar
- Smooth animations
- Auto-close after autofill

---

## 🧠 How to Use

1. Navigate to  
   `https://myte.accenture.com/#/time`

2. Click the **MyTE Autofill Helper** icon in your browser toolbar.

3. In the panel:
   - Load WBS from the page
   - Configure daily hour total (default 7.7)
   - Add WBS with weights
   - Set weekly HW/Office pattern
   - Enable optional rest compliance

4. Click **Fill Timesheet**

The tool fills everything and closes itself afterwards.

---

## 🔒 Privacy

This extension:

- Does **not** collect personal data  
- Does **not** send information externally  
- Does **not** use analytics or tracking  
- Stores settings **only** in browser storage  
- Runs **entirely locally**  
- Interacts only with `https://myte.accenture.com/*`

See the full Privacy Policy in the repository.

---

## 🔧 Permissions

- **storage** – Save user configuration (WBS, weights, theme, pattern)
- **activeTab** – Determine if the current tab is MyTE
- **tabs** – Open MyTE automatically if needed
- **host_permissions** (`https://myte.accenture.com/*`) – Required to interact with MyTE

No other domain is accessed.  
No remote code is used.

---

## ⚠️ Disclaimer

This is a personal productivity tool.  
Users remain fully responsible for reviewing and validating their timesheets before submission.

The tool is **not official Accenture software**.

---

## 🛠 Development

### Folder Structure

```text
myte-autofill/
├── manifest.json
├── background.js
├── content.js
├── panel.html
├── styles.css
├── README.md
└── icons/
    ├── icon16.png
    ├── icon32.png
    ├── icon48.png
    ├── icon128.png
    └── icon.png
```

### Packaging

Update the version and rebuild the package in one step with:

```powershell
./scripts/bump-version.ps1 -Version 1.3.1
```

This updates `manifest.json`, refreshes the README version badge, and rebuilds the Chrome package unless you pass `-SkipPackage`.

Create the Chrome package with:

```powershell
./scripts/package-chrome.ps1
```

This produces:

- `dist/myte-autofill-<version>-chrome.zip`
- `dist/chrome-package-<version>/`
- `dist/myte-autofill-<version>-chrome-contents.txt`
- `dist/myte-autofill-<version>-release-notes.md`

The zip artifact is ready for the Chrome Web Store and contains only the extension payload at the archive root.
The generated release notes summarize product-impacting changes since the previous version tag and are intended for merge-to-main release prep.

### Automated Tests

Install the dev-only test tooling with:

```powershell
npm install
```

Run the automated tests with:

```powershell
npm test
```

Run the browser smoke tests with Playwright after installing Chromium once:

```powershell
npx playwright install chromium
npm run test:smoke
```

Run them locally with a visible browser window:

```powershell
npm run test:smoke:headed
```

Run them in Playwright UI mode for interactive local debugging:

```powershell
npm run test:smoke:ui
```

Generate a local coverage report with:

```powershell
npm run test:coverage
```

The current automated suite covers pure allocation logic, panel lifecycle behavior, MyTE-like DOM scenarios for hour filling, weekly pattern application, WBS autocomplete and favorites, popup-based WBS extraction, and the background action routing logic. A separate Playwright smoke suite runs the real content script in Chromium against a fake MyTE page to verify panel opening, hour filling, and popup-based WBS loading end to end. The live MyTE site still requires a manual smoke test after major DOM automation changes.

### Test Outputs

- `npm test`: Vitest results are printed in the terminal. There is no persistent report file unless you run coverage.
- `npm run test:coverage`: coverage outputs are written under `coverage/`.
- `npm run test:smoke`: Playwright writes the HTML report to `playwright-report/`, JSON results to `test-results/playwright/results.json`, and per-test traces/videos/artifacts to `test-results/playwright/artifacts/`.
- Open the Playwright HTML report with `npm run test:smoke:report`.

### GitHub Actions

The repository includes a workflow at `.github/workflows/package-chrome.yml`.

- Run it manually with **workflow_dispatch**

The workflow uploads the generated Chrome package and contents manifest as build artifacts.
It also uploads the generated release notes file.

The repository also includes a release workflow at `.github/workflows/release-chrome.yml`.

- Push a tag like `v1.2.3`
- The workflow validates that the tag version matches `manifest.json`, builds the package, creates a GitHub Release, and attaches the zip, contents manifest, and generated release notes

The repository also includes Copilot bug automation workflows:

- `.github/workflows/copilot-bug-intake.yml`: validates new bug issues, applies agent labels, and assigns valid issues to GitHub Copilot coding agent
- `.github/workflows/copilot-bug-pr-sync.yml`: mirrors Copilot PR investigation details and lifecycle updates back to the original issue

### Copilot Bug Automation Setup

To enable automated bug investigation with GitHub Copilot:

1. Enable GitHub Copilot coding agent for this repository in the organization or repository settings.
2. Add a repository secret named `COPILOT_AGENT_TOKEN`.
3. Use a user-scoped token that can assign issues to Copilot.

Recommended fine-grained token permissions:

- Metadata: read
- Actions: read and write
- Contents: read and write
- Issues: read and write
- Pull requests: read and write

Optional repository variables:

- `COPILOT_BUG_BASE_BRANCH`: override the branch Copilot should target instead of the default branch
- `COPILOT_BUG_MODEL`: request a specific Copilot coding agent model
- `COPILOT_BUG_CUSTOM_AGENT`: set the custom agent identifier if you want issue assignment to use a repository custom agent instead of the default coding agent

The workflow expects Copilot-created pull requests to include these sections in the PR body:

- `Fixes #<issue-number>`
- `## Investigation Summary`
- `## Root Cause`
- `## Proposed Fix`
- `## Validation`
- `## Risks`

The included repository custom agent at `.github/agents/bug-investigation-specialist.agent.md` is designed to produce that structure.

GitHub MCP is optional here. The issue-to-Copilot workflow uses GitHub's native issue assignment API and does not require MCP. If you want to start Copilot tasks from an IDE or another host instead of issue assignment, GitHub MCP can be enabled separately for `create_pull_request_with_copilot` workflows.

---

## 💬 Feedback & Contributions

Issues and feature requests are welcome.  
Pull requests should preserve the extension’s **single purpose**:  
**Automating safe, accurate MyTE timesheet entry.**

---

## 📄 License

MIT License.
