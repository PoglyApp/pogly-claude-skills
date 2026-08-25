# Builds dist/pogly-create-widget.zip, the release asset claude.ai users upload as a skill.
# Two things matter here:
# - claude.ai caps the frontmatter description at 200 chars, so the zipped copy gets a short
#   one while the repo copy keeps the long description that improves Claude Code triggering.
# - the zip must be built with tar.exe (bsdtar): Compress-Archive writes backslash entry
#   names, which claude.ai rejects with "zip file contains path with invalid characters".
$ErrorActionPreference = "Stop"

$repo = Split-Path -Parent $PSScriptRoot
$stage = Join-Path $env:TEMP "pogly-skill-zip-stage"
if (Test-Path $stage) { Remove-Item -Recurse -Force $stage }
New-Item -ItemType Directory -Force $stage | Out-Null
Copy-Item -Recurse (Join-Path $repo "pogly-widgets\skills\pogly-create-widget") (Join-Path $stage "pogly-create-widget")

$skillMd = Join-Path $stage "pogly-create-widget\SKILL.md"
$short = "Create a working Pogly stream overlay widget from a plain-language request and output its paste-ready import JSON plus a guide to its variables and live toggles."
$content = [System.IO.File]::ReadAllText($skillMd) -replace '(?m)^description: .*$', "description: $short"
[System.IO.File]::WriteAllText($skillMd, $content)

$dist = Join-Path $repo "dist"
New-Item -ItemType Directory -Force $dist | Out-Null
$zip = Join-Path $dist "pogly-create-widget.zip"
if (Test-Path $zip) { Remove-Item $zip }
Push-Location $stage
try { & "$env:SystemRoot\System32\tar.exe" -a -c -f $zip pogly-create-widget }
finally { Pop-Location }

Write-Host "wrote $zip"
& "$env:SystemRoot\System32\tar.exe" -t -f $zip
