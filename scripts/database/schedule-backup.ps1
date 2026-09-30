<#
.SYNOPSIS
  Registers a Windows Scheduled Task that backs up the DCRS database every day at 20:30.

.DESCRIPTION
  The task runs "node scripts\database\backup.ts" in this folder (the same as npm run db:backup):
  the shared database, DCRS's tables and the Audit Assistant's, goes to backend\data\backups
  (or the folder BACKUP_DIR names), kept for 14 days, with a line in backup-log.txt each time.
  The backup reads DATABASE_URL, BACKUP_DATABASE_URL, BACKUP_DIR and PG_BIN from backend\.env,
  the way DCRS reads its settings.

  The task runs as the Windows user who registers it, whether or not anyone is signed in,
  without storing a password (Windows' "S4U" sign-in), so no window opens. It runs on battery
  too, and as soon as the computer is on again if it was off at that time. Running this script
  again replaces the task. docs\DEPLOYMENT.md, "Backups of the shared database", explains it all.

.PARAMETER At
  The time of day, on the 24-hour clock. 20:30 unless given.

.PARAMETER TaskName
  The task's name in Task Scheduler. "DCRS database backup" unless given.

.PARAMETER OnlyWhenSignedIn
  Run only while the user is signed in to Windows (a window shows while it runs). For a
  computer where Windows refuses the default.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\database\schedule-backup.ps1 -WhatIf
  Shows what it would register, and registers nothing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\database\schedule-backup.ps1
  Registers the task.
#>
[CmdletBinding(SupportsShouldProcess = $true)]
param(
  [ValidatePattern('^([01]?[0-9]|2[0-3]):[0-5][0-9]$')]
  [string]$At = '20:30',
  [ValidateNotNullOrEmpty()]
  [string]$TaskName = 'DCRS database backup',
  [switch]$OnlyWhenSignedIn
)

$ErrorActionPreference = 'Stop'

$repo = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..\..')).Path
$backupScript = Join-Path $repo 'scripts\database\backup.ts'
if (-not (Test-Path -LiteralPath $backupScript)) {
  throw "The backup script is not where it should be: $backupScript"
}

$nodeCommand = Get-Command node -CommandType Application -ErrorAction SilentlyContinue | Select-Object -First 1
if (-not $nodeCommand) {
  throw 'Node.js was not found (node is not on PATH). Install Node.js 23.6 or newer, then run this again.'
}
$node = $nodeCommand.Source

$time = [datetime]::ParseExact($At, 'H:mm', [Globalization.CultureInfo]::InvariantCulture)
$user = if ($env:USERDOMAIN) { "$env:USERDOMAIN\$env:USERNAME" } else { $env:USERNAME }
$logonType = if ($OnlyWhenSignedIn) { 'Interactive' } else { 'S4U' }
$how = if ($OnlyWhenSignedIn) { 'only while signed in to Windows' } else { 'whether or not anyone is signed in (no password stored, no window)' }

# These only describe the task; nothing is registered until Register-ScheduledTask below.
$action = New-ScheduledTaskAction -Execute $node -Argument "--no-warnings=ExperimentalWarning `"$backupScript`"" -WorkingDirectory $repo
$trigger = New-ScheduledTaskTrigger -Daily -At $time
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -ExecutionTimeLimit (New-TimeSpan -Hours 2) -MultipleInstances IgnoreNew
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType $logonType -RunLevel Limited
$description = 'Backs up the DCRS database (DCRS and the Audit Assistant) with scripts\database\backup.ts, keeping 14 days. See docs\DEPLOYMENT.md, "Backups of the shared database".'

Write-Host 'The scheduled task:'
Write-Host "  Name:      $TaskName"
Write-Host "  When:      every day at $($time.ToString('HH:mm')); if the computer was off then, as soon as it is on again"
Write-Host "  Runs:      `"$node`" --no-warnings=ExperimentalWarning `"$backupScript`""
Write-Host "  In:        $repo"
Write-Host "  As:        $user, $how"
Write-Host '  Settings:  DATABASE_URL, BACKUP_DATABASE_URL, BACKUP_DIR and PG_BIN, from backend\.env or the environment'
Write-Host '  Its log:   backup-log.txt in the backup folder (backend\data\backups unless BACKUP_DIR says otherwise)'

# Register-ScheduledTask has no -WhatIf of its own: this is what keeps -WhatIf from registering.
if ($PSCmdlet.ShouldProcess($TaskName, "Register a scheduled task that backs up the DCRS database every day at $($time.ToString('HH:mm'))")) {
  Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings -Principal $principal -Description $description -Force | Out-Null
  Write-Host ''
  Write-Host "Registered. It is in Task Scheduler as `"$TaskName`"."
  Write-Host "  Run it now:  Start-ScheduledTask -TaskName '$TaskName'"
  Write-Host "  Remove it:   Unregister-ScheduledTask -TaskName '$TaskName'"
}
elseif ($WhatIfPreference) {
  Write-Host ''
  Write-Host 'Nothing was registered (-WhatIf).'
}
