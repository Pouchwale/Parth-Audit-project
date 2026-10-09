<#
.SYNOPSIS
  Starts the whole application on the plant's server PC, in the background, and starts again any
  part that stops: DCRS (port 4000), the Mitra server (port 3000) and Mitra for Expo Go (port 8081).

.DESCRIPTION
  In this order, each hidden (no window), each waited for before the next:
    1. DCRS: "npm run server" in the DCRS folder (the built app for browsers and its API; its own
       PostgreSQL starts with it; the app is built again by itself, before the server answers, when it
       is missing or older than its code). Ready when http://127.0.0.1:4000/api/health answers.
    2. The Mitra server: "npm --prefix server start" in the Mitra app's folder, "Audit project
       chatbot-mobile" inside the DCRS folder. Ready when http://127.0.0.1:3000/health answers.
    3. Mitra for Expo Go: "npx expo start --lan --port 8081 --no-dev --minify" in the app's mobile
       folder, with REACT_NATIVE_PACKAGER_HOSTNAME set to this PC's address on the company network
       (the best one, by the rules of DCRS's backend/lanAddresses.ts) and CI=1, so Expo Go on the
       phones is pointed at this PC. Ready when http://127.0.0.1:8081/status answers.

  Their output goes to the logs folder in the DCRS folder: logs\dcrs.log, logs\mitra-server.log
  and logs\expo.log, and this script's own lines to logs\plant-servers.log. A part that stops is
  started again after 5 seconds, then 10, 20, 40 and so on, up to 5 minutes between tries; once it
  has run for 10 minutes, the next wait is 5 seconds again. A part that is already running (its
  port answers as it should) is left alone, and one whose port another program holds is not
  started, with a message saying so.

  Keep this window open while the plant works, or let Windows start it when the server's account
  signs in (install-autostart.ps1). Ctrl+C in this window stops all three. From another window,
  -Stop stops them. DCRS's database keeps running in the background, as DCRS always leaves it
  (npm run db:stop stops it). See docs\phone-app-setup.md, step 5.

.PARAMETER DryRun
  Check everything and say what would be started, with which command, settings and address;
  start nothing.

.PARAMETER Stop
  Stop the servers this script started, and the script itself if it runs in the background.

.PARAMETER Dev
  Mitra for Expo Go in development mode (reloads when the app's code changes and shows its errors
  on the phone), for finding a fault. The plant uses the default, production mode.

.PARAMETER AppFolder
  The Mitra app's folder. "Audit project chatbot-mobile" inside the DCRS folder unless given.

.PARAMETER Address
  The address Expo Go is pointed at. This PC's best address on the company network unless given.

.PARAMETER LogFolder
  Where the logs go. The "logs" folder inside the DCRS folder unless given.

.PARAMETER DcrsPort
  DCRS's port: 4000, or what API_PORT in backend\.env says.

.PARAMETER MitraServerPort
  The Mitra server's port: 3000 (the app looks for it there).

.PARAMETER ExpoGoPort
  The port of Expo's server for Expo Go: 8081.

.PARAMETER DcrsCommand
  For testing this script with stand-in servers only: the command line to run instead of DCRS.

.PARAMETER MitraServerCommand
  For testing this script with stand-in servers only: the command line to run instead of the Mitra server.

.PARAMETER ExpoGoCommand
  For testing this script with stand-in servers only: the command line to run instead of Expo.

.PARAMETER RestartAfterSeconds
  The first wait before a part that stopped is started again (5 seconds).

.PARAMETER WatchSeconds
  For testing: stop everything after this many seconds. 0 (the default) watches until stopped.

.EXAMPLE
  npm run plant:start -- -DryRun
  Checks this PC and shows what would be started. Starts nothing.

.EXAMPLE
  npm run plant:start
  Starts all three and watches them. Ctrl+C stops them.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-plant-servers.ps1 -Stop
  Stops what this script started, from another window.
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Stop,
  [switch]$Dev,
  [string]$AppFolder,
  [string]$Address,
  [string]$LogFolder,
  [ValidateRange(1, 65535)][int]$DcrsPort = 4000,
  [ValidateRange(1, 65535)][int]$MitraServerPort = 3000,
  [ValidateRange(1, 65535)][int]$ExpoGoPort = 8081,
  [string]$DcrsCommand,
  [string]$MitraServerCommand,
  [string]$ExpoGoCommand,
  [ValidateRange(1, 3600)][int]$RestartAfterSeconds = 5,
  [ValidateRange(0, 2147483)][int]$WatchSeconds = 0
)

$ErrorActionPreference = 'Stop'

$DcrsFolder = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
if (-not $AppFolder) { $AppFolder = Join-Path $DcrsFolder 'Audit project chatbot-mobile' }
if (-not $LogFolder) { $LogFolder = Join-Path $DcrsFolder 'logs' }
$StateFile = Join-Path $LogFolder 'plant-servers.json'
$OwnLog = Join-Path $LogFolder 'plant-servers.log'
$MaxLogBytes = 10MB
$LongRun = New-TimeSpan -Minutes 10
$MaxWaitSeconds = 300

# The same rules as DCRS's backend/lanAddresses.ts.
$VirtualAdapter = 'vEthernet|\bWSL\b|Hyper-V|VirtualBox|VMware|VMnet|Docker|Tailscale|ZeroTier|Bluetooth|Loopback|\bTAP\b'
$WifiAdapter = 'wi-?fi|wlan|wireless|^wl'

# ---------------------------------------------------------------------------
# small helpers

function Write-Line([string]$text, [string]$color) {
  if ($color) { Write-Host $text -ForegroundColor $color } else { Write-Host $text }
  if (-not $DryRun) {
    try { Add-Content -LiteralPath $OwnLog -Value ('{0}  {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $text) } catch { }
  }
}

function Test-PrivateIPv4([string]$ip) {
  $o = $ip.Split('.') | ForEach-Object { [int]$_ }
  return ($o[0] -eq 10) -or ($o[0] -eq 172 -and $o[1] -ge 16 -and $o[1] -le 31) -or ($o[0] -eq 192 -and $o[1] -eq 168)
}

# This PC's IPv4 addresses that another device could open, the best first (backend/lanAddresses.ts).
function Get-LanAddresses {
  $found = @()
  $order = 0
  foreach ($nic in [System.Net.NetworkInformation.NetworkInterface]::GetAllNetworkInterfaces()) {
    if ([string]$nic.OperationalStatus -ne 'Up' -or [string]$nic.NetworkInterfaceType -eq 'Loopback') { continue }
    foreach ($u in $nic.GetIPProperties().UnicastAddresses) {
      if ([string]$u.Address.AddressFamily -ne 'InterNetwork') { continue }
      $ip = $u.Address.ToString()
      if ($ip -like '127.*' -or $ip -like '169.254.*' -or $ip -eq '0.0.0.0') { continue }
      if (@($found | Where-Object { $_.Ip -eq $ip }).Count -gt 0) { continue }
      $found += [pscustomobject]@{
        Ip = $ip; Interface = $nic.Name; Order = $order
        Virtual = [int]($nic.Name -match $VirtualAdapter); Public = [int](-not (Test-PrivateIPv4 $ip)); Wired = [int](-not ($nic.Name -match $WifiAdapter))
      }
      $order++
    }
  }
  return @($found | Sort-Object Virtual, Public, Wired, Order)
}

# GET a URL on this PC, without any proxy; $null when nothing answered or it was not a 2xx.
function Get-Answer([string]$url, [int]$timeoutMs = 2000) {
  $res = $null
  try {
    $req = [System.Net.HttpWebRequest]::Create($url)
    $req.Proxy = $null
    $req.Timeout = $timeoutMs
    $req.ReadWriteTimeout = $timeoutMs
    $res = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
    return [pscustomobject]@{ Status = [int]$res.StatusCode; Text = $reader.ReadToEnd() }
  }
  catch { return $null }
  finally { if ($res) { $res.Close() } }
}

# EXPO GO ON AN IPHONE NEEDS AN EXPO ACCOUNT (Expo's changelog, 3 September 2026): it opens an app from
# this PC's Expo only when Expo here and Expo Go on the phone are signed in to the same Expo account.
# Expo puts the account's name in the manifest it serves (extra.expoGo.username). Answers that name,
# '' when Expo here is signed in to none, $null when the manifest could not be read.
function Get-ExpoAccount([int]$port) {
  $res = $null
  try {
    $req = [System.Net.HttpWebRequest]::Create("http://127.0.0.1:$port/")
    $req.Proxy = $null
    $req.Timeout = 30000
    $req.ReadWriteTimeout = 30000
    $req.Accept = 'application/expo+json,application/json'
    $req.Headers.Add('expo-platform', 'ios')
    $res = $req.GetResponse()
    $reader = New-Object System.IO.StreamReader($res.GetResponseStream())
    $manifest = ConvertFrom-Json $reader.ReadToEnd()
    $name = $manifest.extra.expoGo.username
    if ($name) { return [string]$name }
    return ''
  }
  catch { return $null }
  finally { if ($res) { $res.Close() } }
}

function Test-PartAnswers($part) {
  $answer = Get-Answer ('http://127.0.0.1:{0}{1}' -f $part.Port, $part.HealthPath)
  if (-not $answer -or $answer.Status -ne 200) { return $false }
  if ($part.Key -eq 'expo') { return $answer.Text -like '*packager-status:running*' }
  try { return ((ConvertFrom-Json $answer.Text).ok -eq $true) } catch { return $false }
}

# Who listens on a port, as "node.exe (process 1234)"; $null when nobody does.
function Get-PortHolder([int]$port) {
  $listen = @(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue)
  if ($listen.Count -eq 0) { return $null }
  $processId = $listen[0].OwningProcess
  $name = (Get-Process -Id $processId -ErrorAction SilentlyContinue).ProcessName
  return ('{0} (process {1})' -f $(if ($name) { "$name.exe" } else { 'a program' }), $processId)
}

function Get-LogTail([string]$path, [int]$lines = 12) {
  try { return @(Get-Content -LiteralPath $path -Tail $lines -ErrorAction Stop) } catch { return @() }
}

function Step-Log([string]$path) {
  try {
    if ((Test-Path -LiteralPath $path) -and (Get-Item -LiteralPath $path).Length -gt $MaxLogBytes) {
      Move-Item -LiteralPath $path -Destination ($path -replace '\.log$', '.previous.log') -Force
    }
  }
  catch { }
}

# Ends a process and everything it started; -Alone ends only the process itself.
function Stop-Tree([int]$processId, [switch]$Alone) {
  # taskkill's complaint about a process that is already gone is not this script's error (in Windows
  # PowerShell, with errors set to stop, a native program's error output would otherwise end the script).
  $ErrorActionPreference = 'SilentlyContinue'
  if ($Alone) { & "$env:SystemRoot\System32\taskkill.exe" /PID $processId /F 2>$null | Out-Null }
  else { & "$env:SystemRoot\System32\taskkill.exe" /PID $processId /T /F 2>$null | Out-Null }
}

function Get-NodeVersion {
  $ErrorActionPreference = 'SilentlyContinue'
  $node = Get-Command node -CommandType Application | Select-Object -First 1
  if (-not $node) { return $null }
  return [string](& $node.Source --version 2>$null | Select-Object -First 1)
}

function Get-Duration([TimeSpan]$t) {
  if ($t.TotalMinutes -lt 1) { return ('{0} seconds' -f [int]$t.TotalSeconds) }
  if ($t.TotalHours -lt 1) { return ('{0} minutes' -f [int]$t.TotalMinutes) }
  return ('{0:n1} hours' -f $t.TotalHours)
}

# ---------------------------------------------------------------------------
# the record of what was started (for -Stop)

function Read-State {
  try { return (Get-Content -LiteralPath $StateFile -Raw -ErrorAction Stop | ConvertFrom-Json) } catch { return $null }
}

function Write-State($parts) {
  $state = [ordered]@{ watcher = [ordered]@{ pid = $PID; started = (Get-Process -Id $PID).StartTime.ToString('o') }; parts = [ordered]@{} }
  foreach ($p in $parts) {
    if ($p.Process -and -not $p.Process.HasExited) {
      $state.parts[$p.Key] = [ordered]@{ title = $p.Title; pid = $p.Process.Id; started = $p.Process.StartTime.ToString('o') }
    }
  }
  try { ($state | ConvertTo-Json -Depth 4) | Set-Content -LiteralPath $StateFile -Encoding UTF8 } catch { }
}

# A process from the record, if it is still the same one (a process id can be used again).
function Get-RecordedProcess($record) {
  if (-not $record) { return $null }
  $p = Get-Process -Id ([int]$record.pid) -ErrorAction SilentlyContinue
  if (-not $p) { return $null }
  try {
    if ([Math]::Abs(($p.StartTime - [datetime]::Parse($record.started)).TotalSeconds) -gt 2) { return $null }
  }
  catch { return $null }
  return $p
}

# ---------------------------------------------------------------------------
# -Stop

if ($Stop) {
  $state = Read-State
  Write-Host ''
  if (-not $state) {
    Write-Host "Nothing to stop: there is no record of servers started by this script ($StateFile)."
  }
  else {
    $watcher = Get-RecordedProcess $state.watcher
    if ($watcher -and $watcher.Id -ne $PID) {
      if ($DryRun) { Write-Host ("Would stop the watcher (process {0}), so it does not start them again." -f $watcher.Id) }
      else { Stop-Tree $watcher.Id -Alone; Write-Host ("Stopped the watcher (process {0}), so it does not start them again." -f $watcher.Id) }
    }
    foreach ($property in $state.parts.PSObject.Properties) {
      $record = $property.Value
      $p = Get-RecordedProcess $record
      if (-not $p) { Write-Host ("{0}: already stopped." -f $record.title); continue }
      if ($DryRun) { Write-Host ("Would stop {0} (process {1} and what it started)." -f $record.title, $p.Id) }
      else { Stop-Tree $p.Id; Write-Host ("Stopped {0} (process {1} and what it started)." -f $record.title, $p.Id) }
    }
    if (-not $DryRun) { Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue }
  }
  foreach ($check in @(@{ Port = $DcrsPort; Title = 'DCRS' }, @{ Port = $MitraServerPort; Title = 'the Mitra server' }, @{ Port = $ExpoGoPort; Title = 'Mitra for Expo Go' })) {
    if (-not $DryRun) { Start-Sleep -Milliseconds 300 }
    $holder = Get-PortHolder $check.Port
    if ($holder -and -not $DryRun) {
      Write-Host ("Port {0} ({1}) is still held by {2}: it was not started by this script. If it runs in a window, press Ctrl+C there." -f $check.Port, $check.Title, $holder)
    }
  }
  Write-Host "DCRS's database keeps running in the background, as DCRS always leaves it; npm run db:stop stops it."
  if ($DryRun) { Write-Host 'Nothing was stopped (-DryRun).' }
  exit 0
}

# ---------------------------------------------------------------------------
# what to start

$addresses = @(Get-LanAddresses)
$real = @($addresses | Where-Object { $_.Virtual -eq 0 })
$best = if ($real.Count -gt 0) { $real[0] } elseif ($addresses.Count -gt 0) { $addresses[0] } else { $null }
$chosenAddress = if ($Address) { $Address.Trim() } elseif ($best) { $best.Ip } else { $null }
$expoArgs = if ($Dev) { "--lan --port $ExpoGoPort" } else { "--lan --port $ExpoGoPort --no-dev --minify" }

$parts = @(
  [pscustomobject]@{
    Key = 'dcrs'; Title = 'DCRS'; Port = $DcrsPort; HealthPath = '/api/health'; WaitSeconds = 180
    Folder = $DcrsFolder; Command = $(if ($DcrsCommand) { $DcrsCommand } else { 'npm run server' }); Stub = [bool]$DcrsCommand
    Environment = @{}; Log = (Join-Path $LogFolder 'dcrs.log')
    Process = $null; StartedAt = $null; Delay = $RestartAfterSeconds; RestartAt = $null; Announced = $false; Watched = $false; Problem = $null
  },
  [pscustomobject]@{
    Key = 'mitra'; Title = 'The Mitra server'; Port = $MitraServerPort; HealthPath = '/health'; WaitSeconds = 120
    Folder = $AppFolder; Command = $(if ($MitraServerCommand) { $MitraServerCommand } else { 'npm --prefix server start' }); Stub = [bool]$MitraServerCommand
    Environment = @{}; Log = (Join-Path $LogFolder 'mitra-server.log')
    Process = $null; StartedAt = $null; Delay = $RestartAfterSeconds; RestartAt = $null; Announced = $false; Watched = $false; Problem = $null
  },
  [pscustomobject]@{
    Key = 'expo'; Title = 'Mitra for Expo Go'; Port = $ExpoGoPort; HealthPath = '/status'; WaitSeconds = $MaxWaitSeconds
    Folder = (Join-Path $AppFolder 'mobile'); Command = $(if ($ExpoGoCommand) { $ExpoGoCommand } else { "npx expo start $expoArgs" }); Stub = [bool]$ExpoGoCommand
    Environment = @{ REACT_NATIVE_PACKAGER_HOSTNAME = $chosenAddress; CI = '1' }; Log = (Join-Path $LogFolder 'expo.log')
    Process = $null; StartedAt = $null; Delay = $RestartAfterSeconds; RestartAt = $null; Announced = $false; Watched = $false; Problem = $null
  }
)

# ---------------------------------------------------------------------------
# the checks (also with -DryRun)

$checks = @()
function Add-Check([string]$what, [bool]$ok, [string]$fix, [string[]]$blocks) {
  $script:checks += [pscustomobject]@{ What = $what; Ok = $ok; Fix = $fix }
  if (-not $ok) { foreach ($k in $blocks) { ($parts | Where-Object { $_.Key -eq $k }).Problem = $fix } }
}

$nodeVersion = Get-NodeVersion
if (-not $nodeVersion) {
  Add-Check 'Node.js' $false 'Node.js is not installed, or not on PATH: install Node.js 24 (LTS) from nodejs.org, then sign out of Windows and in again.' @('dcrs', 'mitra', 'expo')
}
else {
  $major = [int](([string]$nodeVersion).TrimStart('v').Split('.')[0])
  Add-Check "Node.js $nodeVersion" ($major -ge 24) "Node.js $nodeVersion is too old: the Mitra server needs 24 or newer. Install Node.js 24 (LTS) from nodejs.org." @('dcrs', 'mitra', 'expo')
}
$npm = Get-Command npm.cmd -ErrorAction SilentlyContinue
Add-Check 'npm' ([bool]$npm) 'npm is not on PATH: it comes with Node.js; install Node.js 24 (LTS) again.' @('dcrs', 'mitra', 'expo')

if (-not $DcrsCommand) {
  Add-Check "DCRS's packages ($DcrsFolder\node_modules)" (Test-Path -LiteralPath (Join-Path $DcrsFolder 'node_modules')) "Run npm install in $DcrsFolder." @('dcrs')
  # frontend\dist is not checked here: DCRS builds it itself when it is missing or older than its code (backend\websiteBuild.ts).
}
if (-not ($MitraServerCommand -and $ExpoGoCommand)) {
  $appThere = Test-Path -LiteralPath (Join-Path $AppFolder 'package.json')
  Add-Check "The Mitra app's folder ($AppFolder)" $appThere "Put the ""Audit project chatbot-mobile"" folder inside $DcrsFolder, or give -AppFolder." @('mitra', 'expo')
  if ($appThere) {
    if (-not $MitraServerCommand) {
      Add-Check "The Mitra server's packages (server\node_modules)" (Test-Path -LiteralPath (Join-Path $AppFolder 'server\node_modules')) "Run npm run mitra:setup in $DcrsFolder." @('mitra')
      Add-Check "The Mitra server's settings (server\.env)" (Test-Path -LiteralPath (Join-Path $AppFolder 'server\.env')) 'Copy server\.env.example to server\.env and fill it in (docs\phone-app-setup.md, step 3).' @('mitra')
    }
    if (-not $ExpoGoCommand) {
      Add-Check "The Mitra app's packages (mobile\node_modules)" (Test-Path -LiteralPath (Join-Path $AppFolder 'mobile\node_modules')) "Run npm run mitra:setup in $DcrsFolder." @('expo')
    }
  }
}
if ($chosenAddress) {
  $how = if ($Address) { 'given with -Address' } elseif ($best.Virtual -eq 1) { "$($best.Interface), a VIRTUAL adapter: no phone can reach it" } else { $best.Interface }
  Add-Check "The address for Expo Go: $chosenAddress ($how)" (-not ($best -and $best.Virtual -eq 1 -and -not $Address)) 'Connect this PC to the company network (Wi-Fi or cable), or give -Address.' @()
}
else {
  Add-Check 'The address for Expo Go' $false 'This PC has no network address: connect it to the company network (Wi-Fi or cable), or give -Address.' @('expo')
}

# Each port: free, already the right server (left alone), or held by another program (not started).
foreach ($part in $parts) {
  if ($part.Problem) { continue }
  if (Test-PartAnswers $part) {
    $part.Problem = 'running'
    continue
  }
  $holder = Get-PortHolder $part.Port
  if ($holder) {
    Add-Check ("Port {0} for {1}" -f $part.Port, $part.Title) $false ("Port {0} is held by {1}, which is not {2}: stop that program, then start this again." -f $part.Port, $holder, $part.Title) @($part.Key)
  }
}

# ---------------------------------------------------------------------------
# what it says before it starts

if (-not $DryRun) {
  New-Item -ItemType Directory -Force -Path $LogFolder | Out-Null
  Step-Log $OwnLog
}
Write-Line ''
Write-Line ("The plant's servers on {0}{1}" -f $env:COMPUTERNAME, $(if ($DryRun) { ' (dry run: nothing is started)' } else { '' }))
Write-Line ("  DCRS folder:       {0}" -f $DcrsFolder)
Write-Line ("  Mitra app folder:  {0}" -f $AppFolder)
Write-Line ("  Logs:              {0}" -f $LogFolder)
if ($addresses.Count -gt 0) {
  Write-Line ("  This PC's addresses, best first: {0}" -f (($addresses | ForEach-Object { '{0} ({1}{2})' -f $_.Ip, $_.Interface, $(if ($_.Virtual) { ', virtual' } else { '' }) }) -join '; '))
}
Write-Line ''
Write-Line 'Checks:'
foreach ($c in $checks) {
  if ($c.Ok) { Write-Line ('  OK       {0}' -f $c.What) }
  else { Write-Line ('  PROBLEM  {0}: {1}' -f $c.What, $c.Fix) 'Yellow' }
}
Write-Line ''

# A second copy would only fight the first over the ports.
$mutex = New-Object System.Threading.Mutex($false, 'Local\DCRS-plant-servers')
$haveMutex = $false
try { $haveMutex = $mutex.WaitOne(0) } catch [System.Threading.AbandonedMutexException] { $haveMutex = $true }
if (-not $haveMutex) {
  $state = Read-State
  $other = if ($state -and $state.watcher) { " (process $($state.watcher.pid))" } else { '' }
  Write-Line ("The plant's servers are already being started and watched by another copy of this script{0}." -f $other) 'Yellow'
  Write-Line 'To start them afresh: run this script with -Stop, then start it again.'
  if (-not $DryRun) { exit 1 }
  Write-Line ''
}
elseif ($DryRun) { $mutex.ReleaseMutex(); $haveMutex = $false }

if ($DryRun) {
  Write-Line 'Would start, each hidden, in this order:'
  $n = 0
  foreach ($part in $parts) {
    $n++
    if ($part.Problem -eq 'running') { Write-Line ("  {0}. {1}: already running on port {2}; would be left as it is." -f $n, $part.Title, $part.Port); continue }
    if ($part.Problem) { Write-Line ("  {0}. {1}: would NOT be started: {2}" -f $n, $part.Title, $part.Problem) 'Yellow'; continue }
    Write-Line ("  {0}. {1}:  {2}" -f $n, $part.Title, $part.Command)
    Write-Line ("     in {0}" -f $part.Folder)
    foreach ($k in $part.Environment.Keys) { Write-Line ("     with {0}={1}" -f $k, $part.Environment[$k]) }
    Write-Line ("     its output in {0}; ready when http://127.0.0.1:{1}{2} answers" -f $part.Log, $part.Port, $part.HealthPath)
  }
  Write-Line ''
  if ($chosenAddress) {
    Write-Line ("Then laptops and desktops open DCRS at http://{0}:{1}, and phones open Mitra in Expo Go at exp://{0}:{2}." -f $chosenAddress, $DcrsPort, $ExpoGoPort)
  }
  Write-Line 'Nothing was started (-DryRun).'
  $blocked = @($checks | Where-Object { -not $_.Ok }).Count
  exit $(if ($blocked -gt 0) { 1 } else { 0 })
}

# ---------------------------------------------------------------------------
# starting and watching

function Start-Part($part) {
  Step-Log $part.Log
  try { Add-Content -LiteralPath $part.Log -Value ('==== {0}  starting: {1}  (in {2})' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $part.Command, $part.Folder) } catch { }
  $psi = New-Object System.Diagnostics.ProcessStartInfo
  $psi.FileName = "$env:SystemRoot\System32\cmd.exe"
  # cmd /s /c "...": the outer quotes go, the rest runs as written; its output is added to the part's log.
  $psi.Arguments = '/d /s /c "' + $part.Command + ' >> "' + $part.Log + '" 2>&1"'
  $psi.WorkingDirectory = $part.Folder
  $psi.UseShellExecute = $false
  $psi.CreateNoWindow = $true
  foreach ($k in $part.Environment.Keys) {
    if ($null -ne $part.Environment[$k]) { $psi.EnvironmentVariables[$k] = [string]$part.Environment[$k] }
  }
  $part.Process = [System.Diagnostics.Process]::Start($psi)
  $part.StartedAt = Get-Date
  $part.Announced = $false
  $part.Watched = $true
  Write-State $parts
}

function Wait-Part($part) {
  $deadline = (Get-Date).AddSeconds($part.WaitSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-PartAnswers $part) { return 'up' }
    if ($part.Process.HasExited) { return 'exited' }
    Start-Sleep -Milliseconds 1000
  }
  return 'slow'
}

function Show-LogTail($part) {
  $tail = Get-LogTail $part.Log
  if ($tail.Count -gt 0) {
    Write-Line ("  The last lines of {0}:" -f $part.Log)
    foreach ($line in $tail) { Write-Line ('    ' + $line) }
  }
}

$urls = @{
  dcrs = $(if ($chosenAddress) { "http://${chosenAddress}:$DcrsPort" } else { "http://127.0.0.1:$DcrsPort" })
  mitra = $(if ($chosenAddress) { "http://${chosenAddress}:$MitraServerPort" } else { "http://127.0.0.1:$MitraServerPort" })
  expo = $(if ($chosenAddress) { "exp://${chosenAddress}:$ExpoGoPort" } else { "exp://127.0.0.1:$ExpoGoPort" })
}

try {
  foreach ($part in $parts) {
    if ($part.Problem -eq 'running') {
      Write-Line ("{0} is already running on port {1}: left as it is, and not watched by this script." -f $part.Title, $part.Port)
      continue
    }
    if ($part.Problem) {
      Write-Line ("{0} is NOT started: {1}" -f $part.Title, $part.Problem) 'Yellow'
      continue
    }
    Write-Line ("Starting {0}: {1}" -f $part.Title, $part.Command)
    Start-Part $part
    $result = Wait-Part $part
    switch ($result) {
      'up' {
        $part.Announced = $true
        Write-Line ("{0} is up after {1}: {2}" -f $part.Title, (Get-Duration ((Get-Date) - $part.StartedAt)), $urls[$part.Key]) 'Green'
        if ($part.Key -eq 'expo') {
          $expoAccount = Get-ExpoAccount $part.Port
          if ($expoAccount) {
            Write-Line ("Expo is signed in to the Expo account ""{0}"": each iPhone's Expo Go must be signed in to that same account." -f $expoAccount)
          }
          elseif ($null -ne $expoAccount) {
            Write-Line 'Expo on this PC is not signed in to an Expo account, so iPhones cannot open Mitra yet: Expo Go on an' 'Yellow'
            Write-Line 'iPhone needs this PC and the phone signed in to the same Expo account (Android does not, yet).' 'Yellow'
            Write-Line ("Once, as {0}: run npx expo login in {1}; then start the servers again." -f $env:USERNAME, $part.Folder) 'Yellow'
          }
        }
      }
      'exited' {
        Write-Line ("{0} stopped while starting (exit code {1})." -f $part.Title, $part.Process.ExitCode) 'Yellow'
        Show-LogTail $part
      }
      'slow' {
        Write-Line ("{0} has not answered in {1} seconds: still starting, or stuck. It is watched; its output is in {2}." -f $part.Title, $part.WaitSeconds, $part.Log) 'Yellow'
      }
    }
  }

  $watched = @($parts | Where-Object { $_.Watched })
  Write-Line ''
  if ($chosenAddress) {
    Write-Line ("Laptops and desktops open DCRS at:  {0}" -f $urls.dcrs)
    Write-Line ("Phones open Mitra in Expo Go at:    {0}   (the QR code is on DCRS's Ask Mitra page)" -f $urls.expo)
  }
  if ($watched.Count -eq 0) {
    Write-Line 'Nothing was started, so there is nothing to watch.'
    return
  }
  Write-Line ("Watching {0}. A part that stops is started again. Ctrl+C stops them all." -f (($watched | ForEach-Object { $_.Title }) -join ', '))
  $until = if ($WatchSeconds -gt 0) { (Get-Date).AddSeconds($WatchSeconds) } else { [datetime]::MaxValue }

  while ((Get-Date) -lt $until) {
    foreach ($part in $watched) {
      if ($part.RestartAt) {
        if ((Get-Date) -ge $part.RestartAt) {
          $part.RestartAt = $null
          $holder = Get-PortHolder $part.Port
          if ($holder) {
            Write-Line ("{0}: port {1} is now held by {2}, so it is not started again." -f $part.Title, $part.Port, $holder) 'Yellow'
            $part.Watched = $false
            continue
          }
          Write-Line ("Starting {0} again: {1}" -f $part.Title, $part.Command)
          Start-Part $part
        }
        continue
      }
      if ($part.Process -and $part.Process.HasExited) {
        $ran = (Get-Date) - $part.StartedAt
        if ($ran -ge $LongRun) { $part.Delay = $RestartAfterSeconds }
        Write-Line ("{0} stopped (exit code {1}) after {2}. Starting it again in {3} seconds." -f $part.Title, $part.Process.ExitCode, (Get-Duration $ran), $part.Delay) 'Yellow'
        Show-LogTail $part
        $part.RestartAt = (Get-Date).AddSeconds($part.Delay)
        $part.Delay = [Math]::Min($part.Delay * 2, $MaxWaitSeconds)
        Write-State $parts
        continue
      }
      if (-not $part.Announced -and (Test-PartAnswers $part)) {
        $part.Announced = $true
        Write-Line ("{0} is up again: {1}" -f $part.Title, $urls[$part.Key]) 'Green'
      }
    }
    $watched = @($watched | Where-Object { $_.Watched })
    if ($watched.Count -eq 0) { break }
    Start-Sleep -Seconds 2
  }
}
finally {
  # Ctrl+C, the end of -WatchSeconds, or an error: what this script started stops with it.
  foreach ($part in $parts) {
    if ($part.Process -and -not $part.Process.HasExited) {
      Stop-Tree $part.Process.Id
      Write-Line ("Stopped {0}." -f $part.Title)
    }
  }
  Remove-Item -LiteralPath $StateFile -Force -ErrorAction SilentlyContinue
  if ($haveMutex) { try { $mutex.ReleaseMutex() } catch { } }
}
