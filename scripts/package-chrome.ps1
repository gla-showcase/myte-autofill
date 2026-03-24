param(
    [string]$RootPath = (Split-Path -Parent $PSScriptRoot),
    [string]$DistPath,
    [switch]$WriteGitHubOutput
)

$ErrorActionPreference = 'Stop'

function Get-GitLines {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $output = & git @Arguments 2>$null
    if (-not $AllowFailure -and $LASTEXITCODE -ne 0) {
        throw "Git command failed: git $($Arguments -join ' ')"
    }

    if ($LASTEXITCODE -ne 0) {
        return @()
    }

    if ($null -eq $output) {
        return @()
    }

    return @($output)
}

function Get-GitValue {
    param(
        [Parameter(Mandatory = $true)]
        [string[]]$Arguments,
        [switch]$AllowFailure
    )

    $lines = Get-GitLines -Arguments $Arguments -AllowFailure:$AllowFailure
    if ($lines.Count -eq 0) {
        return $null
    }

    return ($lines -join "`n").Trim()
}

$root = (Resolve-Path $RootPath).Path
if (-not $DistPath) {
    $DistPath = Join-Path $root 'dist'
}

Push-Location $root
try {
    $insideGit = Get-GitValue -Arguments @('rev-parse', '--is-inside-work-tree') -AllowFailure
    if ($insideGit -ne 'true') {
        throw 'Packaging script must run inside the repository working tree.'
    }

    $manifestPath = Join-Path $root 'manifest.json'
    if (-not (Test-Path $manifestPath)) {
        throw "manifest.json not found at $manifestPath"
    }

    $manifest = Get-Content -Path $manifestPath -Raw | ConvertFrom-Json
    $version = $manifest.version
    if (-not $version) {
        throw 'manifest.json is missing a version value.'
    }

    $stageDir = Join-Path $DistPath "chrome-package-$version"
    $zipName = "myte-autofill-$version-chrome.zip"
    $zipPath = Join-Path $DistPath $zipName
    $contentsPath = Join-Path $DistPath "myte-autofill-$version-chrome-contents.txt"
    $releaseNotesPath = Join-Path $DistPath "myte-autofill-$version-release-notes.md"

    $requiredPaths = @(
        'manifest.json',
        'background.js',
        'content.js',
        'panel.html',
        'styles.css',
        'icons'
    )
    $productPaths = @(
        'manifest.json',
        'background.js',
        'content.js',
        'panel.html',
        'styles.css',
        'icons'
    )

    New-Item -ItemType Directory -Path $DistPath -Force | Out-Null
    if (Test-Path $stageDir) {
        Remove-Item -Path $stageDir -Recurse -Force
    }
    if (Test-Path $zipPath) {
        Remove-Item -Path $zipPath -Force
    }

    New-Item -ItemType Directory -Path $stageDir -Force | Out-Null

    foreach ($relativePath in $requiredPaths) {
        $sourcePath = Join-Path $root $relativePath
        if (-not (Test-Path $sourcePath)) {
            throw "Required packaging path not found: $relativePath"
        }

        $destinationPath = Join-Path $stageDir $relativePath
        if (Test-Path $sourcePath -PathType Container) {
            Copy-Item -Path $sourcePath -Destination $destinationPath -Recurse -Force
        }
        else {
            Copy-Item -Path $sourcePath -Destination $destinationPath -Force
        }
    }

    $archiveEntries = Get-ChildItem -Path $stageDir -Recurse -File |
        ForEach-Object {
            $_.FullName.Substring($stageDir.Length + 1).Replace('\', '/')
        } |
        Sort-Object

    $archiveEntries | Set-Content -Path $contentsPath

    Compress-Archive -Path (Join-Path $stageDir '*') -DestinationPath $zipPath -CompressionLevel Optimal

    if (-not (Test-Path $zipPath)) {
        throw "Package creation failed: $zipPath"
    }

    $currentTag = "v$version"
    $versionTags = Get-GitLines -Arguments @('tag', '--sort=-version:refname', '--list', 'v*') -AllowFailure
    $previousTag = $versionTags | Where-Object { $_ -ne $currentTag } | Select-Object -First 1
    $compareLabel = if ($previousTag) { "$previousTag..HEAD" } else { 'repository start..HEAD' }
    $headCommit = Get-GitValue -Arguments @('rev-parse', '--short', 'HEAD')
    $branchName = Get-GitValue -Arguments @('rev-parse', '--abbrev-ref', 'HEAD')
    $headSubject = Get-GitValue -Arguments @('log', '-1', '--pretty=%s')
    $headBody = Get-GitValue -Arguments @('log', '-1', '--pretty=%b') -AllowFailure
    $mergeInfo = if ($headSubject -match '^Merge pull request #(\d+) from (.+)$') {
        'PR #{0} merged from {1} into {2}.' -f $Matches[1], $Matches[2], $branchName
    }
    elseif ($headSubject -like 'Merge *') {
        'Latest commit on {0} is a merge commit: {1}' -f $branchName, $headSubject
    }
    else {
        'Latest commit on {0}: {1}' -f $branchName, $headSubject
    }

    if ($previousTag) {
        $commitLines = Get-GitLines -Arguments (@('log', '--pretty=format:- %h %s', "$previousTag..HEAD", '--') + $productPaths)
        $changedFiles = Get-GitLines -Arguments (@('diff', '--name-only', "$previousTag..HEAD", '--') + $productPaths)
    }
    else {
        $commitLines = Get-GitLines -Arguments (@('log', '--pretty=format:- %h %s', '--') + $productPaths)
        $changedFiles = Get-GitLines -Arguments (@('ls-files', '--') + $productPaths)
    }

    if ($commitLines.Count -eq 0) {
        $commitLines = @('- No committed changes found in the selected compare range.')
    }
    if ($changedFiles.Count -eq 0) {
        $changedFiles = @('- No changed files detected.')
    }
    else {
        $changedFiles = $changedFiles | ForEach-Object { "- $_" }
    }

    $releaseNotes = @(
        "# Release Notes for v$version",
        '',
        ('- Generated from branch {0} at commit {1}.' -f $branchName, $headCommit),
        ('- Compare range: {0}.' -f $compareLabel),
        ('- {0}' -f $mergeInfo),
        '',
        '## Summary',
        '',
        "This package captures product-impacting changes included in v$version relative to the previous tagged version.",
        '',
        '## Product Commits Since Previous Version',
        ''
    )

    $releaseNotes += $commitLines
    $releaseNotes += @(
        '',
        '## Product Files Changed Since Previous Version',
        ''
    )
    $releaseNotes += $changedFiles

    if ($headBody) {
        $releaseNotes += @(
            '',
            '## Latest Commit Details',
            '',
            $headBody
        )
    }

    $releaseNotes | Set-Content -Path $releaseNotesPath

    Write-Host "Created Chrome package: $zipPath"
    Write-Host "Version: $version"
    Write-Host "Release notes: $releaseNotesPath"

    if ($WriteGitHubOutput -and $env:GITHUB_OUTPUT) {
        Add-Content -Path $env:GITHUB_OUTPUT -Value "package_path=$zipPath"
        Add-Content -Path $env:GITHUB_OUTPUT -Value "package_name=$zipName"
        Add-Content -Path $env:GITHUB_OUTPUT -Value "package_version=$version"
        Add-Content -Path $env:GITHUB_OUTPUT -Value "contents_path=$contentsPath"
        Add-Content -Path $env:GITHUB_OUTPUT -Value "release_notes_path=$releaseNotesPath"
    }
}
finally {
    Pop-Location
}