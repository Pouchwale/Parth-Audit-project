<#
.SYNOPSIS
  Opens Windows Firewall on the plant's server PC for DCRS (TCP 4000), the Mitra server (TCP 3000)
  and Mitra for Expo Go (TCP 8081), for the company network only.

.DESCRIPTION
  Laptops and desktops open DCRS at http://<this PC>:4000. Staff phones open Mitra in Expo Go at
  exp://<this PC>:8081, and the app then talks to the Mitra server at http://<this PC>:3000.
  Windows Firewall turns all three away until it is told otherwise. This script adds one inbound
  "allow" rule for each port, for the Private and Domain network profiles: the company network,
  once Windows knows it as one. It never opens them on Public networks unless -AnyProfile is given.

  Running it again is safe: a rule that is already right is left alone, and one that differs is
  made again. -Remove takes the three rules away. -DryRun shows what it would do and changes
  nothing.

  It also shows each connected network card and how Windows classes its network. On a network
  marked Public, Windows applies only its Public rules, so these rules do nothing there: mark the
  company network Private (-SetPrivate does it, or Settings > Network & internet). And it warns
  about any rule that BLOCKS Node.js coming in, which wins over every allow rule.

  Changing the firewall needs an administrator: open Windows PowerShell with "Run as
  administrator". -DryRun does not. See docs\phone-app-setup.md, step 4.

.PARAMETER DryRun
  Show what would be done; change nothing. Needs no administrator.

.PARAMETER Remove
  Take the three rules away again.

.PARAMETER AnyProfile
  Open the ports on Public networks too. Any network this PC joins, a cafe's Wi-Fi included, could
  then reach DCRS and Mitra: use it only when the company network cannot be marked Private.

.PARAMETER SetPrivate
  Mark each connected network that Windows treats as Public as Private (virtual adapters such as
  WSL are left alone). Only for the company network: never on a network you do not trust.

.PARAMETER DcrsPort
  DCRS's port, 4000 unless API_PORT in backend\.env says otherwise.

.PARAMETER MitraServerPort
  The Mitra server's port, 3000. The app looks for it there.

.PARAMETER ExpoGoPort
  The port of Expo's server for Expo Go, 8081.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\open-firewall.ps1 -DryRun
  Shows the networks, the rules it would add, and anything in their way. Changes nothing.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\open-firewall.ps1
  In an administrator's PowerShell: adds (or puts right) the three rules.

.EXAMPLE
  powershell -NoProfile -ExecutionPolicy Bypass -File scripts\windows\open-firewall.ps1 -SetPrivate
  In an administrator's PowerShell: marks the company network Private, then adds the rules.
#>
[CmdletBinding()]
param(
  [switch]$DryRun,
  [switch]$Remove,
  [switch]$AnyProfile,
  [switch]$SetPrivate,
  [ValidateRange(1, 65535)][int]$DcrsPort = 4000,
  [ValidateRange(1, 65535)][int]$MitraServerPort = 3000,
  [ValidateRange(1, 65535)][int]$ExpoGoPort = 8081
)

$ErrorActionPreference = 'Stop'
# What this run was given, to say how to run it again as an administrator.
$BoundAtStart = $PSBoundParameters

# The same names as backend/lanAddresses.ts: adapters that exist only inside this PC.
$VirtualAdapter = 'vEthernet|\bWSL\b|Hyper-V|VirtualBox|VMware|VMnet|Docker|Tailscale|ZeroTier|Bluetooth|Loopback|\bTAP\b'
$Group = 'DCRS plant servers'
$Rules = @(
  [pscustomobject]@{ Name = 'DCRS-Plant-DCRS'; DisplayName = "DCRS for browsers (TCP $DcrsPort)"; Port = $DcrsPort
    Description = "Laptops and desktops on the company network open DCRS at http://<this PC>:$DcrsPort. Added by DCRS's scripts\windows\open-firewall.ps1." },
  [pscustomobject]@{ Name = 'DCRS-Plant-MitraServer'; DisplayName = "Mitra server for the phones (TCP $MitraServerPort)"; Port = $MitraServerPort
    Description = "The Mitra app on the staff's phones talks to the Mitra server at http://<this PC>:$MitraServerPort. Added by DCRS's scripts\windows\open-firewall.ps1." },
  [pscustomobject]@{ Name = 'DCRS-Plant-ExpoGo'; DisplayName = "Mitra for Expo Go (TCP $ExpoGoPort)"; Port = $ExpoGoPort
    Description = "Expo Go on the staff's phones loads the Mitra app from exp://<this PC>:$ExpoGoPort. Added by DCRS's scripts\windows\open-firewall.ps1." }
)

function Test-Elevated {
  $identity = [Security.Principal.WindowsIdentity]::GetCurrent()
  return (New-Object Security.Principal.WindowsPrincipal $identity).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)
}

# A rule's profiles as a number: Domain 1, Private 2, Public 4 ("Any" counts as all three).
function Get-ProfileMask($profileValue) {
  $mask = [int]$profileValue
  if ($mask -eq 0 -or ($mask -band 7) -eq 7) { return 7 }
  return ($mask -band 7)
}

function Get-ProfileWords([int]$mask) {
  $names = @()
  if ($mask -band 1) { $names += 'Domain' }
  if ($mask -band 2) { $names += 'Private' }
  if ($mask -band 4) { $names += 'Public' }
  return ($names -join ', ')
}

function Get-RerunCommand {
  $line = 'powershell -NoProfile -ExecutionPolicy Bypass -File "' + $PSCommandPath + '"'
  foreach ($key in $BoundAtStart.Keys) {
    $value = $BoundAtStart[$key]
    if ($value -is [switch]) { if ($value.IsPresent) { $line += " -$key" } }
    else { $line += " -$key $value" }
  }
  return $line
}

$wantMask = if ($AnyProfile) { 7 } else { 3 }
$wantProfiles = Get-ProfileWords $wantMask
$elevated = Test-Elevated
$mode = if ($Remove) { 'remove the rules' } else { "allow TCP $DcrsPort, $MitraServerPort and $ExpoGoPort in, on $wantProfiles networks" }

Write-Host ''
Write-Host "Windows Firewall for the plant's servers on ${env:COMPUTERNAME}: $mode."
if ($DryRun) { Write-Host 'Dry run: nothing is changed.' }
Write-Host ''

# ---------------------------------------------------------------------------
# 1. The networks this PC is on, and how Windows classes each one.
Write-Host 'The networks this PC is connected to:'
$connected = @(Get-NetConnectionProfile -ErrorAction SilentlyContinue)
$publicReal = @()
if ($connected.Count -eq 0) {
  Write-Host '  None. Connect this PC to the company network (Wi-Fi or cable).'
}
foreach ($p in $connected) {
  $virtual = $p.InterfaceAlias -match $VirtualAdapter
  $category = [string]$p.NetworkCategory
  $note = switch ($category) {
    'Public' { 'Windows treats it as a public place (a cafe, an airport)' }
    'Private' { 'a trusted network: the rules apply here' }
    'DomainAuthenticated' { "the company's domain network: the rules apply here" }
    default { '' }
  }
  if ($virtual) { $note = 'a virtual adapter inside this PC, not the company network' }
  Write-Host ("  {0}: network ""{1}"" is {2} - {3}." -f $p.InterfaceAlias, $p.Name, $category, $note)
  if ($category -eq 'Public' -and -not $virtual) { $publicReal += $p }
}
if ($publicReal.Count -gt 0 -and -not $AnyProfile -and -not $Remove) {
  Write-Host ''
  Write-Host '  On a Public network these rules do NOT apply, so phones and laptops stay shut out.'
  Write-Host '  If that is the company network, mark it Private: run this again with -SetPrivate, or open'
  Write-Host '  Settings > Network & internet > (the connection) > Network profile type > Private network.'
}
Write-Host ''

# ---------------------------------------------------------------------------
# 2. Changing anything needs an administrator.
$changing = -not $DryRun
if ($changing -and -not $elevated) {
  Write-Host 'Changing the firewall needs an administrator, and this PowerShell is not running as one.' -ForegroundColor Yellow
  Write-Host 'Open the Start menu, type PowerShell, right-click "Windows PowerShell" and choose "Run as administrator".'
  Write-Host 'Then run, in that window:'
  Write-Host ('  ' + (Get-RerunCommand))
  Write-Host 'To see first what it would do, without an administrator, add -DryRun.'
  exit 1
}

# ---------------------------------------------------------------------------
# 3. -SetPrivate: the company network, marked Private.
if ($SetPrivate) {
  if ($publicReal.Count -eq 0) {
    Write-Host '-SetPrivate: no connected network is Public; nothing to mark.'
  }
  foreach ($p in $publicReal) {
    if ($DryRun) {
      Write-Host ("-SetPrivate would mark {0} (network ""{1}"") Private." -f $p.InterfaceAlias, $p.Name)
    }
    else {
      Set-NetConnectionProfile -InterfaceIndex $p.InterfaceIndex -NetworkCategory Private
      Write-Host ("Marked {0} (network ""{1}"") Private." -f $p.InterfaceAlias, $p.Name)
    }
  }
  Write-Host ''
}

# ---------------------------------------------------------------------------
# 4. The three rules.
if ($AnyProfile -and -not $Remove) {
  Write-Host 'WARNING: -AnyProfile opens the three ports on Public networks too. Any network this PC joins,' -ForegroundColor Yellow
  Write-Host 'a cafe''s Wi-Fi included, could then reach DCRS and Mitra. Use it only when the company network' -ForegroundColor Yellow
  Write-Host 'cannot be marked Private, and never on a laptop that leaves the plant.' -ForegroundColor Yellow
  Write-Host ''
}
Write-Host 'The rules (group "DCRS plant servers" in Windows Defender Firewall, Inbound Rules):'
foreach ($r in $Rules) {
  $existing = Get-NetFirewallRule -Name $r.Name -ErrorAction SilentlyContinue
  if ($Remove) {
    if (-not $existing) { Write-Host ("  {0}: not there; nothing to remove." -f $r.DisplayName); continue }
    if ($DryRun) { Write-Host ("  {0}: would be removed." -f $existing.DisplayName); continue }
    Remove-NetFirewallRule -Name $r.Name
    Write-Host ("  {0}: removed." -f $existing.DisplayName)
    continue
  }

  $state = 'missing'
  if ($existing) {
    $ports = $existing | Get-NetFirewallPortFilter
    $right = ([string]$existing.Enabled -eq 'True') -and ([string]$existing.Direction -eq 'Inbound') -and ([string]$existing.Action -eq 'Allow') -and
      ((Get-ProfileMask $existing.Profile) -eq $wantMask) -and ([string]$ports.Protocol -eq 'TCP') -and ([string]$ports.LocalPort -eq [string]$r.Port) -and
      ($existing.DisplayName -eq $r.DisplayName)
    $state = if ($right) { 'right' } else { 'different' }
  }
  switch ($state) {
    'right' { Write-Host ("  {0}: already there, allowing TCP {1} in on {2} networks. Left as it is." -f $r.DisplayName, $r.Port, $wantProfiles) }
    'missing' {
      if ($DryRun) { Write-Host ("  {0}: would be added, allowing TCP {1} in on {2} networks." -f $r.DisplayName, $r.Port, $wantProfiles) }
      else {
        New-NetFirewallRule -Name $r.Name -DisplayName $r.DisplayName -Group $Group -Description $r.Description -Direction Inbound -Action Allow `
          -Protocol TCP -LocalPort $r.Port -Profile $wantProfiles -Enabled True | Out-Null
        Write-Host ("  {0}: added, allowing TCP {1} in on {2} networks." -f $r.DisplayName, $r.Port, $wantProfiles)
      }
    }
    'different' {
      $was = "{0}, {1}, TCP {2}, {3} networks, {4}" -f $existing.Action, $existing.Direction, $ports.LocalPort, (Get-ProfileWords (Get-ProfileMask $existing.Profile)), $(if ([string]$existing.Enabled -eq 'True') { 'on' } else { 'off' })
      if ($DryRun) { Write-Host ("  {0}: there but different ({1}); would be made again." -f $r.DisplayName, $was) }
      else {
        Remove-NetFirewallRule -Name $r.Name
        New-NetFirewallRule -Name $r.Name -DisplayName $r.DisplayName -Group $Group -Description $r.Description -Direction Inbound -Action Allow `
          -Protocol TCP -LocalPort $r.Port -Profile $wantProfiles -Enabled True | Out-Null
        Write-Host ("  {0}: was different ({1}); made again, allowing TCP {2} in on {3} networks." -f $r.DisplayName, $was, $r.Port, $wantProfiles)
      }
    }
  }
}
Write-Host ''

# ---------------------------------------------------------------------------
# 5. A rule that BLOCKS Node.js coming in wins over every allow rule. Windows makes one when
#    somebody answers its "allow Node.js?" question with Cancel; DCRS, the Mitra server and Expo
#    all run in Node.js.
if (-not $Remove) {
  $blocks = @(Get-NetFirewallRule -Direction Inbound -Action Block -Enabled True -ErrorAction SilentlyContinue)
  $nodeBlocks = @()
  foreach ($b in $blocks) {
    $program = [string]($b | Get-NetFirewallApplicationFilter).Program
    if ($program -match '\\node\.exe$') { $nodeBlocks += [pscustomobject]@{ Rule = $b; Program = $program } }
  }
  if ($nodeBlocks.Count -eq 0) {
    Write-Host 'No firewall rule blocks Node.js coming in.'
  }
  else {
    Write-Host 'WARNING: these rules BLOCK Node.js coming in, and a block wins over every allow rule:' -ForegroundColor Yellow
    foreach ($n in $nodeBlocks) {
      Write-Host ("  ""{0}"" on {1} networks ({2})" -f $n.Rule.DisplayName, (Get-ProfileWords (Get-ProfileMask $n.Rule.Profile)), $n.Program)
    }
    Write-Host '  Windows made them when its "allow Node.js?" question was answered with Cancel. To remove them, in an'
    Write-Host '  administrator''s PowerShell (this script leaves them alone):'
    foreach ($n in $nodeBlocks) { Write-Host ("    Remove-NetFirewallRule -Name '{0}'" -f $n.Rule.Name) }
  }
  Write-Host ''
}

if ($DryRun) {
  Write-Host 'Nothing was changed (-DryRun).'
}
elseif ($Remove) {
  Write-Host 'Done: the three rules are gone.'
}
else {
  Write-Host 'Done. Check it from a phone on the company Wi-Fi: open http://<this PC>:3000/health in its browser;'
  Write-Host 'it should say {"ok":true}. (npm run phone:check prints this PC''s address.)'
}
