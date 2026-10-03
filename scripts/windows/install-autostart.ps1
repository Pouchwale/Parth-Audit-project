<#
.SYNOPSIS
  Makes Windows start the plant's servers (DCRS, the Mitra server and Mitra for Expo Go) whenever
  the server PC's Windows account signs in, with no window: a Task Scheduler task that runs
  scripts\windows\start-plant-servers.ps1.

.DESCRIPTION
  WHICH ACCOUNT, AND WHY IT MATTERS. The task runs as one Windows account, when that account signs
  in, and never with administrator rights (Task Scheduler's "Limited" run level). Run this script
  while signed in as the account that will keep the servers going: a standard (not administrator)
  Windows account kept for the server PC, the same one that set DCRS and Mitra up (npm install,
  npm run mitra:setup, the first start).
    - The servers listen on the company network. Without administrator rights, a fault in one of
      them, or somebody breaking into one, cannot take over the whole PC.
    - PostgreSQL, which keeps DCRS's records, refuses to run with administrator rights at all. DCRS
      starts it through pg_ctl, which gives those rights up first, so it starts either way; but
      that is what the database expects of the account it runs as.
    - The files are that account's: DCRS's database and session-signing key (backend\data), the
      Mitra server's database (server\.data) and settings (server\.env), and the Node.js and Expo
      files in the account's own profile. Started as another account, the servers may not be able
      to read them.
    - The task starts when that account signs in. After a power cut, Windows must sign it in by
      itself (automatic sign-in: docs\phone-app-setup.md, step 5), or somebody must sign in.

  The task:
    - starts 30 seconds after the sign-in, so the network is up first;
    - runs "conhost.exe --headless powershell.exe ... start-plant-servers.ps1": no window at all,
      even where Windows Terminal is the default terminal, which would otherwise show one;
    - has no time limit (Task Scheduler stops a task after 3 days unless told otherwise), runs at
      normal priority (its own default is below normal, which slows the servers down), on battery
      too, and only one copy at a time. The script itself starts again any server that stops.

  -Remove takes the task away. -DryRun shows what would be registered and registers nothing. This
  script never starts the servers itself: the task does, at the next sign-in, or at once with
  Start-ScheduledTask. See docs\phone-app-setup.md, step 5.

.PARAMETER DryRun
  Show the task and the account it would run as; register nothing.

.PARAMETER Remove
  Take the task away again.

.PARAMETER User
  The Windows account the task runs as: the account running this script unless given. Give it only
  when an administrator registers the task for the server's standard account, as in
  -User PLANT-PC\dcrs, from an administrator's PowerShell.

.PARAMETER TaskName
  The task's name in Task Scheduler: "DCRS plant servers" unless given.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -DryRun
  Shows the task and the account. Registers nothing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1
  Registers the task for the account running it.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Remove
  Takes the task away.
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Remove,
  [string]$User,
  [ValidateNotNullOrEmpty()][string]$TaskName = 'DCRS plant servers'
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$startScript = Join-Path $PSScriptRoot 'start-plant-servers.ps1'
$conhost = Join-Path $env:SystemRoot 'System32\conhost.exe'
$powershell = Join-Path $env:SystemRoot 'System32\WindowsPowerShell\v1.0\powershell.exe'
$current = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$account = if ($User) { $User.Trim() } else { $current }

function Test-Elevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# True when the account is in the Administrators group, whether or not it is using those rights now
# (Windows hides them until "Run as administrator"); $null when it cannot be told.
function Test-AdministratorAccount([string]$name) {
  $ErrorActionPreference = 'SilentlyContinue'
  if ($name -ieq $current) {
    # whoami lists the groups with their SIDs; S-1-5-32-544 is Administrators in every language.
    $groups = @(& "$env:SystemRoot\System32\whoami.exe" /groups /fo csv /nh 2>$null | ConvertFrom-Csv -Header Name, Type, Sid, Attributes)
    if ($groups.Count -eq 0) { return $null }
    return [bool](@($groups | Where-Object { $_.Sid -eq 'S-1-5-32-544' }).Count -gt 0)
  }
  $members = @(Get-LocalGroupMember -SID 'S-1-5-32-544' 2>$null)
  if ($members.Count -eq 0) { return $null }
  $short = ($name -split '\\')[-1]
  return [bool](@($members | Where-Object { $_.Name -ieq $name -or ($_.Name -split '\\')[-1] -ieq $short }).Count -gt 0)
}

$elevated = Test-Elevated
$isAdmin = Test-AdministratorAccount $account
$existing = Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue

Write-Host ''
Write-Host ("Start the plant's servers at sign-in{0}" -f $(if ($DryRun) { ' (dry run: nothing is registered)' } else { '' }))
Write-Host ("  Task:      {0}{1}" -f $TaskName, $(if ($existing) { ' (already registered: it would be replaced)' } else { '' }))
Write-Host ("  Account:   {0}" -f $account)
if ($isAdmin -eq $true) {
  Write-Host '             This is an ADMINISTRATOR account. The task still runs without administrator' -ForegroundColor Yellow
  Write-Host '             rights, but the servers face the company network, so a standard account kept' -ForegroundColor Yellow
  Write-Host '             for the server PC is safer. See docs\phone-app-setup.md, step 3.' -ForegroundColor Yellow
}
elseif ($isAdmin -eq $false) {
  Write-Host '             A standard account: good.'
}
else {
  Write-Host '             (Could not tell whether it is an administrator.)'
}
if ($elevated -and -not $User) {
  Write-Host '  Note:      this PowerShell runs as administrator, which is not needed. The task is still' -ForegroundColor Yellow
  Write-Host ("             registered for {0}: make sure that is the server's account." -f $account) -ForegroundColor Yellow
}

if ($Remove) {
  if (-not $existing) { Write-Host ("There is no task called ""{0}""; nothing to remove." -f $TaskName); exit 0 }
  if ($DryRun) { Write-Host ("Would remove the task ""{0}"". The servers it started keep running until stopped (start-plant-servers.ps1 -Stop)." -f $TaskName); exit 0 }
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host ("Removed the task ""{0}"". The servers it started keep running until stopped: start-plant-servers.ps1 -Stop." -f $TaskName)
  exit 0
}

foreach ($needed in @($startScript, $conhost, $powershell)) {
  if (-not (Test-Path -LiteralPath $needed)) { Write-Host "Not found: $needed" -ForegroundColor Red; exit 1 }
}

$argument = '--headless "' + $powershell + '" -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File "' + $startScript + '"'
$action = New-ScheduledTaskAction -Execute $conhost -Argument $argument -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -AtLogOn -User $account
$trigger.Delay = 'PT30S'
$settings = New-ScheduledTaskSettingsSet -ExecutionTimeLimit ([TimeSpan]::Zero) -Priority 5 -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
  -StartWhenAvailable -MultipleInstances IgnoreNew -RestartCount 3 -RestartInterval (New-TimeSpan -Minutes 1)
$principal = New-ScheduledTaskPrincipal -UserId $account -LogonType Interactive -RunLevel Limited
$description = "Starts DCRS (port 4000), the Mitra server (port 3000) and Mitra for Expo Go (port 8081) with no window when $account signs in, and starts again any that stops: scripts\windows\start-plant-servers.ps1. Logs in $repo\logs. See docs\phone-app-setup.md."

Write-Host ("  When:      when {0} signs in, after {1} seconds" -f $account, 30)
Write-Host ("  Runs:      ""{0}"" {1}" -f $conhost, $argument)
Write-Host ("  In:        {0}" -f $repo)
Write-Host ("  Rights:    {0} (never as administrator); only while {1} is signed in" -f $principal.RunLevel, $account)
Write-Host ("  Settings:  no time limit ({0}), priority {1} (normal), on battery too, one copy at a time" -f $settings.ExecutionTimeLimit, $settings.Priority)
Write-Host ("  Its log:   {0}" -f (Join-Path $repo 'logs\plant-servers.log'))
Write-Host ''

if ($DryRun) {
  Write-Host 'Nothing was registered (-DryRun).'
  exit 0
}

try {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description -Force | Out-Null
}
catch {
  $message = $_.Exception.Message
  Write-Host ("Windows did not register the task: {0}" -f $message.Trim()) -ForegroundColor Red
  if ($message -match 'denied|0x80070005') {
    Write-Host 'Registering it needs an administrator here. Open the Start menu, type PowerShell, right-click'
    Write-Host '"Windows PowerShell", choose "Run as administrator", and run, in the DCRS folder:'
    Write-Host ('  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -User ' + $account)
    Write-Host 'The task still runs as that account, without administrator rights.'
  }
  exit 1
}
Write-Host ("Registered. It starts the servers the next time {0} signs in." -f $account) -ForegroundColor Green
Write-Host ("  Start it now, without signing out:  Start-ScheduledTask -TaskName '{0}'" -f $TaskName)
Write-Host '  See what it does:                    logs\plant-servers.log, then npm run phone:check'
Write-Host '  Stop the servers:                    powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\start-plant-servers.ps1 -Stop'
Write-Host '  Remove the task:                     powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\install-autostart.ps1 -Remove'
