# Chrome Web Store Release Template

Use this template when preparing a Chrome Web Store update for this repository.

## Release Metadata

- Version: `<version>`
- Store target: Chrome Web Store
- Edge compatibility: Compatible package, Edge Store publication pending
- Release date: `YYYY-MM-DD`
- Release owner: `<name>`

Use the version from `manifest.json` when filling this template.

## Pre-Release Checks

- [ ] `manifest.json` version matches the intended release
- [ ] Extension name, description, icons, and action title are correct
- [ ] Permissions and host permissions still match actual behavior
- [ ] `web_accessible_resources` contains only what is required
- [ ] No secrets, temporary files, or irrelevant workspace files are included in the package
- [ ] README version and packaging details are still accurate if they changed
- [ ] Manual smoke test completed on `https://myte.accenture.com/#/time`

## Manual Smoke Test

- [ ] Extension icon opens or toggles the panel correctly
- [ ] WBS loading still works on the MyTE page
- [ ] Autofill runs without breaking the page workflow
- [ ] HW/Office weekly pattern still applies correctly
- [ ] Rest compliance checkboxes still behave correctly
- [ ] Panel closes or resets as expected after autofill

## Package Checklist

- [ ] Run `./scripts/package-chrome.ps1`
- [ ] Package contains: `manifest.json`, `background.js`, `content.js`, `panel.html`, `styles.css`, and `icons/`
- [ ] Package excludes: `.git/`, `.github/`, local notes, screenshots, and editor-specific files unless explicitly needed
- [ ] Zip artifact name follows a clear format such as `myte-autofill-<version>-chrome.zip`
- [ ] Zip opens cleanly and contains the extension files at the root
- [ ] Generated release notes file exists in `dist/` and correctly summarizes changes since the previous version tag
- [ ] Generated release notes focus on product-relevant extension changes and exclude repo-only noise where practical
- [ ] If using CI, confirm the artifact from `.github/workflows/package-chrome.yml` or the release from `.github/workflows/release-chrome.yml` matches the local package

## Release Notes Template

### Summary

`<version>` improves the MyTE Autofill Helper with the following updates:

- `<change 1>`
- `<change 2>`
- `<change 3>`

### User Impact

- `<who benefits and how>`

### Risk Notes

- `<known limitation or low-risk change note>`

## Store Submission Notes

- Chrome Web Store upload status: `<not started | in progress | submitted | approved>`
- Review notes for Chrome: `<notes>`
- Edge note: Package remains Edge-compatible, but Edge Add-ons publication is still pending

## Final Sign-Off

- [ ] Zip artifact created
- [ ] Release notes prepared
- [ ] Submission metadata reviewed
- [ ] GitHub Release created for the matching `v<version>` tag when applicable
- [ ] Ready for Chrome Web Store upload
