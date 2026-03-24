# MyTE Autofill Helper  
**Autofill Accenture MyTE timesheets with multi-WBS allocations & HW/Office patterns**

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

```
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

### GitHub Actions

The repository includes a workflow at `.github/workflows/package-chrome.yml`.

- Run it manually with **workflow_dispatch**

The workflow uploads the generated Chrome package and contents manifest as build artifacts.
It also uploads the generated release notes file.

The repository also includes a release workflow at `.github/workflows/release-chrome.yml`.

- Push a tag like `v1.2.3`
- The workflow validates that the tag version matches `manifest.json`, builds the package, creates a GitHub Release, and attaches the zip, contents manifest, and generated release notes

---

## 💬 Feedback & Contributions

Issues and feature requests are welcome.  
Pull requests should preserve the extension’s **single purpose**:  
**Automating safe, accurate MyTE timesheet entry.**

---

## 📄 License

MIT License.



