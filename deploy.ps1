<#
    PRESS IT — one-shot deploy to GitHub Pages.

    Run this AFTER `gh auth login`. It creates the repo, pushes, turns on
    Pages, grants the updater permission to commit back, then writes the live
    URL into content/curated.json and rebuilds so the sitemap and canonical
    tags point at the real address.

        .\deploy.ps1
        .\deploy.ps1 -RepoName taemin-archive     # if you want another name

    Safe to re-run: every step checks whether it's already been done.
#>

param(
  [string]$RepoName = 'press-it',
  [string]$Domain = '',   # e.g. -Domain taemin.wiki  (set DNS first, see README)
  [switch]$Private
)

# Deliberately NOT 'Stop'. In Windows PowerShell 5.1 anything a native .exe
# writes to stderr becomes a terminating error under 'Stop', so a harmless
# "you are not logged in" would blow up as a stack trace. Native calls are
# checked via $LASTEXITCODE instead.
$ErrorActionPreference = 'Continue'

$gh = "$env:ProgramFiles\GitHub CLI\gh.exe"
if (-not (Test-Path $gh)) { $gh = "$env:LOCALAPPDATA\Programs\GitHub CLI\gh.exe" }
if (-not (Test-Path $gh)) {
  Write-Host "GitHub CLI not found. Install it with:  winget install GitHub.cli" -ForegroundColor Red
  exit 1
}

function Step($n, $msg) { Write-Host "`n[$n] $msg" -ForegroundColor Cyan }
function Ok($msg)       { Write-Host "    OK  $msg"  -ForegroundColor Green }
function Note($msg)     { Write-Host "    --  $msg"  -ForegroundColor DarkGray }
function Fail($msg)     { Write-Host "    !!  $msg"  -ForegroundColor Yellow }

# Run gh with every stream swallowed; report success purely by exit code.
function Gh {
  & $gh @args *>$null
  return ($LASTEXITCODE -eq 0)
}

# Run gh and capture stdout.
function GhRead {
  $out = & $gh @args 2>$null
  if ($LASTEXITCODE -ne 0) { return $null }
  return ($out | Out-String).Trim()
}

# ── 1. auth ──────────────────────────────────────────────────────────────
Step 1 'Checking GitHub login'
if (-not (Gh auth status)) {
  Write-Host ''
  Write-Host '  Not logged in yet. Run this first:' -ForegroundColor Yellow
  Write-Host ''
  Write-Host '      gh auth login' -ForegroundColor White
  Write-Host ''
  Write-Host '  Choose: GitHub.com  ->  HTTPS  ->  Yes (authenticate git)'
  Write-Host '          ->  Login with a web browser'
  Write-Host ''
  Write-Host '  Then run  .\deploy.ps1  again.' -ForegroundColor Yellow
  Write-Host ''
  exit 1
}

$owner = GhRead api user --jq .login
if (-not $owner) { Fail 'could not read your username'; exit 1 }
Ok "signed in as $owner"

# ── 2. repo ──────────────────────────────────────────────────────────────
Step 2 "Repository $owner/$RepoName"
if (Gh repo view "$owner/$RepoName") {
  Note 'already exists'
  if ((git remote) -notcontains 'origin') {
    git remote add origin "https://github.com/$owner/$RepoName.git"
  }

  # The updater commits refreshed data every 6 hours, so on any re-run the
  # remote is almost certainly ahead. Rebase onto it rather than failing.
  # data/site.json is generated, so on a conflict take the remote copy and
  # let the rebuild below regenerate it.
  git fetch -q origin
  # --autostash so uncommitted edits in the working tree don't block it.
  git rebase --autostash origin/main
  if ($LASTEXITCODE -ne 0) {
    git checkout --ours data/site.json 2>$null
    git add data/site.json 2>$null
    git -c core.editor=true rebase --continue
    if ($LASTEXITCODE -ne 0) {
      git rebase --abort
      Fail 'could not rebase onto the remote. Resolve by hand: git pull --rebase'
      exit 1
    }
    Note 'reconciled a generated-file conflict'
  }

  git push -u origin main
  if ($LASTEXITCODE -ne 0) { Fail 'push failed'; exit 1 }
} else {
  # Pages needs a paid plan on private repos, so public is the default.
  $vis = if ($Private) { '--private' } else { '--public' }
  & $gh repo create $RepoName $vis --source=. --remote=origin --push
  if ($LASTEXITCODE -ne 0) { Fail 'repo creation failed'; exit 1 }
}
Ok "https://github.com/$owner/$RepoName"

# ── 3. let the updater push back ─────────────────────────────────────────
Step 3 'Granting Actions permission to commit'
$granted = Gh api -X PUT "repos/$owner/$RepoName/actions/permissions/workflow" `
             -f default_workflow_permissions=write `
             -F can_approve_pull_request_reviews=false
if ($granted) { Ok 'workflows can push refreshed data' }
else { Fail 'do it by hand: Settings > Actions > General > Read and write permissions' }

# ── 4. pages ─────────────────────────────────────────────────────────────
Step 4 'Enabling GitHub Pages'
if (Gh api "repos/$owner/$RepoName/pages") {
  Note 'already enabled'
} elseif (Gh api -X POST "repos/$owner/$RepoName/pages" -f "source[branch]=main" -f "source[path]=/") {
  Ok 'serving from main / root'
} else {
  Fail 'do it by hand: Settings > Pages > Deploy from a branch > main / root'
}

# ── 4b. custom domain ────────────────────────────────────────────────────
# Pages serves from a lowercased host regardless of how the username is
# cased, so the canonical tag and sitemap have to match that or they point
# somewhere subtly different from the real address.
$siteUrl = "https://$($owner.ToLower()).github.io/$RepoName"

if ($Domain) {
  Step '4b' "Pointing Pages at $Domain"

  # The CNAME file has to be in the repo as well as set via the API — Pages
  # reads the file on each build and would otherwise drop the domain the next
  # time the updater commits.
  $cnamePath = Join-Path $PSScriptRoot 'CNAME'
  $needsCname = -not (Test-Path $cnamePath)
  if (-not $needsCname) {
    $needsCname = ((Get-Content $cnamePath -Raw).Trim() -ne $Domain)
  }
  if ($needsCname) {
    [System.IO.File]::WriteAllText($cnamePath, "$Domain`n")
    git add CNAME
    git commit -q -m "Serve from $Domain"
    git push -q
    Ok 'CNAME committed'
  } else {
    Note 'CNAME already correct'
  }

  # Set the domain on its own. Passing https_enforced at the same time fails,
  # because GitHub can't enforce HTTPS before it has issued the certificate —
  # and issuing only starts once the domain is attached. It gets switched on
  # in a second call below, after the cert exists.
  if (Gh api -X PUT "repos/$owner/$RepoName/pages" -f "cname=$Domain") {
    Ok 'domain registered with Pages'
  } else {
    Fail 'Pages rejected the domain. Check DNS has propagated, then set it by hand under Settings / Pages / Custom domain'
  }

  # Certificate provisioning takes a few minutes; retry rather than give up.
  Note 'waiting for the HTTPS certificate'
  $httpsOn = $false
  foreach ($attempt in 1..10) {
    Start-Sleep -Seconds 30
    if (Gh api -X PUT "repos/$owner/$RepoName/pages" -F "https_enforced=true") {
      $httpsOn = $true
      break
    }
  }
  if ($httpsOn) { Ok 'HTTPS enforced' }
  else { Note 'certificate not ready yet. Tick "Enforce HTTPS" under Settings / Pages once it is' }

  $siteUrl = "https://$Domain"
}

# ── 5. point the build at the real URL ───────────────────────────────────
Step 5 'Writing the live URL into the build'
$curatedPath = Join-Path $PSScriptRoot 'content\curated.json'
$curated = Get-Content $curatedPath -Raw -Encoding UTF8

if ($curated -match ('"siteUrl":\s*"' + [regex]::Escape($siteUrl) + '"')) {
  Note 'already set'
} else {
  $curated = $curated -replace '"siteUrl":\s*"[^"]*"', ('"siteUrl": "' + $siteUrl + '"')
  # WriteAllText with an explicit no-BOM encoder — Set-Content would add a
  # BOM that makes the JSON awkward for anything stricter than build.js.
  [System.IO.File]::WriteAllText($curatedPath, $curated, (New-Object System.Text.UTF8Encoding $false))
  Ok "siteUrl = $siteUrl"
}

# ── 6. rebuild and push ──────────────────────────────────────────────────
Step 6 'Rebuilding with sitemap, robots and canonical tags'
node build.js
if ($LASTEXITCODE -ne 0) { Fail 'build failed'; exit 1 }

if (git status --porcelain) {
  git add -A
  git commit -q -m "chore: point the build at $siteUrl"
  git push -q
  if ($LASTEXITCODE -eq 0) { Ok 'pushed' } else { Fail 'push failed' }
} else {
  Note 'nothing new to push'
}

# ── done ─────────────────────────────────────────────────────────────────
Write-Host ''
Write-Host '────────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host '  Live in a minute or two at' -ForegroundColor White
Write-Host "  $siteUrl/" -ForegroundColor Green
Write-Host ''
Write-Host "  Repo     https://github.com/$owner/$RepoName"
Write-Host "  Actions  https://github.com/$owner/$RepoName/actions"
Write-Host ''
Write-Host '  The updater runs every 6 hours. To fire it right now:'
Write-Host '      gh workflow run "Update site data"' -ForegroundColor White
Write-Host '────────────────────────────────────────────────' -ForegroundColor DarkGray
Write-Host ''
