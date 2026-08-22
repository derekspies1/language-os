[CmdletBinding()]
param(
  [ValidateSet("Open", "Restart", "Stop", "Server", "ViewLog")]
  [string]$Action = "Open",
  [string]$RepositoryPath = "C:\Projects\Language OS",
  [switch]$NoBrowser,
  [switch]$NonInteractive,
  [int]$ReadyTimeoutSeconds = 90
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$AppName = "Language OS Dev"
$AppUrl = "http://localhost:3000/"
$DebugUrl = "http://localhost:3000/__debug"
$StateDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Language OS Dev"
$StatePath = Join-Path $StateDirectory "server.json"
$ServerLogPath = Join-Path $StateDirectory "server.log"
$LauncherLogPath = Join-Path $StateDirectory "launcher.log"
$LockHashPath = Join-Path $StateDirectory "package-lock.sha256"
$WindowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$TaskKill = Join-Path $env:SystemRoot "System32\taskkill.exe"

function Initialize-StateDirectory {
  if (-not (Test-Path -LiteralPath $StateDirectory)) {
    New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
  }
}

function Write-LauncherLog {
  param([string]$Message)

  Initialize-StateDirectory
  $timestamp = (Get-Date).ToString("yyyy-MM-dd HH:mm:ss.fff")
  Add-Content -LiteralPath $LauncherLogPath -Value "[$timestamp] $Message" -Encoding UTF8
}

function Show-Information {
  param([string]$Message)

  if ($NonInteractive) {
    Write-Output $Message
    return
  }

  Add-Type -AssemblyName System.Windows.Forms
  [System.Windows.Forms.MessageBox]::Show(
    $Message,
    $AppName,
    [System.Windows.Forms.MessageBoxButtons]::OK,
    [System.Windows.Forms.MessageBoxIcon]::Information
  ) | Out-Null
}

function Show-Failure {
  param([string]$Message)

  $details = $Message
  if (Test-Path -LiteralPath $ServerLogPath) {
    $tail = (Get-Content -LiteralPath $ServerLogPath -Tail 18 -ErrorAction SilentlyContinue) -join [Environment]::NewLine
    if ($tail) {
      $details += "`r`n`r`nRecent server output:`r`n$tail"
    }
  }

  if ($NonInteractive) {
    [Console]::Error.WriteLine($details)
    return
  }

  Add-Type -AssemblyName System.Windows.Forms
  $choice = [System.Windows.Forms.MessageBox]::Show(
    "$details`r`n`r`nOpen the complete log in Notepad?",
    "$AppName - startup failed",
    [System.Windows.Forms.MessageBoxButtons]::YesNo,
    [System.Windows.Forms.MessageBoxIcon]::Error
  )
  if ($choice -eq [System.Windows.Forms.DialogResult]::Yes) {
    $logToOpen = if (Test-Path -LiteralPath $ServerLogPath) { $ServerLogPath } else { $LauncherLogPath }
    Start-Process -FilePath "notepad.exe" -ArgumentList "`"$logToOpen`"" | Out-Null
  }
}

function Resolve-CommandPath {
  param([string]$Name)

  $command = Get-Command $Name -ErrorAction SilentlyContinue | Select-Object -First 1
  if (-not $command) {
    throw "$Name is not installed or is not available on PATH."
  }
  return $command.Source
}

function Test-LanguageOsHealth {
  try {
    $root = Invoke-WebRequest -Uri $AppUrl -UseBasicParsing -TimeoutSec 2
    if ($root.StatusCode -ne 200 -or $root.Content -notmatch "<title>Language OS") {
      return $false
    }

    $debug = Invoke-WebRequest -Uri $DebugUrl -UseBasicParsing -TimeoutSec 2
    return $debug.StatusCode -eq 200
  } catch {
    return $false
  }
}

function Test-DevPortOpen {
  $client = New-Object System.Net.Sockets.TcpClient
  $waitHandle = $null
  try {
    $result = $client.BeginConnect("127.0.0.1", 3000, $null, $null)
    $waitHandle = $result.AsyncWaitHandle
    if (-not $waitHandle.WaitOne(500, $false)) {
      return $false
    }
    $client.EndConnect($result)
    return $true
  } catch {
    return $false
  } finally {
    if ($waitHandle) { $waitHandle.Close() }
    $client.Close()
  }
}

function Remove-StaleState {
  if (Test-Path -LiteralPath $StatePath) {
    Remove-Item -LiteralPath $StatePath -Force -ErrorAction SilentlyContinue
  }
}

function Get-OwnedServer {
  if (-not (Test-Path -LiteralPath $StatePath)) {
    return $null
  }

  try {
    $state = Get-Content -LiteralPath $StatePath -Raw | ConvertFrom-Json
    if ([string]$state.RepositoryPath -ne $RepositoryPath) {
      Remove-StaleState
      return $null
    }

    $process = Get-Process -Id ([int]$state.Pid) -ErrorAction Stop
    $recordedStart = [DateTime]::Parse(
      [string]$state.StartTimeUtc,
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::RoundtripKind
    ).ToUniversalTime()
    $actualStart = $process.StartTime.ToUniversalTime()
    if ([Math]::Abs(($actualStart - $recordedStart).TotalSeconds) -gt 2) {
      Remove-StaleState
      return $null
    }

    return [pscustomobject]@{ State = $state; Process = $process }
  } catch {
    Remove-StaleState
    return $null
  }
}

function Write-ServerState {
  param([System.Diagnostics.Process]$Process)

  $state = [pscustomobject]@{
    Pid = $Process.Id
    StartTimeUtc = $Process.StartTime.ToUniversalTime().ToString("o")
    RepositoryPath = $RepositoryPath
    Url = $AppUrl
  }
  $temporaryPath = "$StatePath.$PID.tmp"
  $state | ConvertTo-Json | Set-Content -LiteralPath $temporaryPath -Encoding UTF8
  Move-Item -LiteralPath $temporaryPath -Destination $StatePath -Force
}

function Assert-RepositoryPrerequisites {
  if (-not (Test-Path -LiteralPath $RepositoryPath -PathType Container)) {
    throw "The Language OS repository was not found at $RepositoryPath."
  }

  foreach ($relativePath in @("package.json", "package-lock.json", ".node-version")) {
    $fullPath = Join-Path $RepositoryPath $relativePath
    if (-not (Test-Path -LiteralPath $fullPath -PathType Leaf)) {
      throw "The repository is missing $relativePath."
    }
  }

  $node = Resolve-CommandPath "node.exe"
  $npm = Resolve-CommandPath "npm.cmd"
  $expectedNode = (Get-Content -LiteralPath (Join-Path $RepositoryPath ".node-version") -Raw).Trim()
  $actualNode = (& $node --version).Trim().TrimStart("v")
  if ($actualNode -ne $expectedNode) {
    throw "Language OS expects Node $expectedNode, but Node $actualNode is active."
  }

  $package = Get-Content -LiteralPath (Join-Path $RepositoryPath "package.json") -Raw | ConvertFrom-Json
  $expectedNpm = ([string]$package.packageManager -replace "^npm@", "").Trim()
  $actualNpm = (& $npm --version).Trim()
  if ($expectedNpm -and $actualNpm -ne $expectedNpm) {
    throw "Language OS expects npm $expectedNpm, but npm $actualNpm is active."
  }

  Write-LauncherLog "Prerequisites OK: Node $actualNode, npm $actualNpm."
  return [pscustomobject]@{ Node = $node; Npm = $npm }
}

function Initialize-SessionLog {
  $header = @(
    "Language OS Dev startup",
    "Timestamp: $((Get-Date).ToString("o"))",
    "Repository: $RepositoryPath",
    "URL: $AppUrl",
    ""
  )
  $header | Set-Content -LiteralPath $ServerLogPath -Encoding UTF8
}

function Get-FileSha256 {
  param([string]$Path)

  $stream = [System.IO.File]::OpenRead($Path)
  $sha256 = [System.Security.Cryptography.SHA256]::Create()
  try {
    $bytes = $sha256.ComputeHash($stream)
    return ([BitConverter]::ToString($bytes)).Replace("-", "")
  } finally {
    $sha256.Dispose()
    $stream.Dispose()
  }
}

function Sync-DependenciesIfNeeded {
  param([string]$NpmPath)

  $packageLockPath = Join-Path $RepositoryPath "package-lock.json"
  $currentHash = Get-FileSha256 -Path $packageLockPath
  $storedHash = if (Test-Path -LiteralPath $LockHashPath) {
    (Get-Content -LiteralPath $LockHashPath -Raw).Trim()
  } else {
    ""
  }
  $vinextCommand = Join-Path $RepositoryPath "node_modules\.bin\vinext.cmd"
  $crossEnvCommand = Join-Path $RepositoryPath "node_modules\.bin\cross-env.cmd"
  $needsInstall = $storedHash -ne $currentHash -or
    -not (Test-Path -LiteralPath $vinextCommand) -or
    -not (Test-Path -LiteralPath $crossEnvCommand)

  if (-not $needsInstall) {
    Write-LauncherLog "Dependency lock hash is current."
    return
  }

  Write-LauncherLog "Running npm ci because dependencies are missing or package-lock.json changed."
  Push-Location $RepositoryPath
  try {
    # Let cmd.exe merge native stdout/stderr as UTF-8 bytes. Windows PowerShell
    # 5.1 otherwise rewrites native stderr as UTF-16 ErrorRecord text.
    $commandLine = "chcp 65001 > nul & `"$NpmPath`" ci >> `"$ServerLogPath`" 2>&1"
    & $env:ComSpec /d /s /c $commandLine
    $exitCode = $LASTEXITCODE
  } finally {
    Pop-Location
  }
  if ($exitCode -ne 0) {
    throw "npm ci failed with exit code $exitCode."
  }
  $currentHash | Set-Content -LiteralPath $LockHashPath -Encoding ASCII
  Write-LauncherLog "npm ci completed successfully."
}

function Start-ServerHost {
  $arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$PSCommandPath`" -Action Server -RepositoryPath `"$RepositoryPath`""
  $process = Start-Process `
    -FilePath $WindowsPowerShell `
    -ArgumentList $arguments `
    -WorkingDirectory $RepositoryPath `
    -WindowStyle Hidden `
    -PassThru
  Start-Sleep -Milliseconds 250
  $process.Refresh()
  if ($process.HasExited) {
    throw "The development-server host exited before startup completed."
  }
  Write-ServerState -Process $process
  Write-LauncherLog "Started server host PID $($process.Id)."
  return $process
}

function Wait-ForLanguageOs {
  param([System.Diagnostics.Process]$Process)

  $deadline = (Get-Date).AddSeconds($ReadyTimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    if (Test-LanguageOsHealth) {
      Write-LauncherLog "Language OS is reachable at $AppUrl."
      return
    }

    if ($Process) {
      $Process.Refresh()
      if ($Process.HasExited) {
        Remove-StaleState
        throw "The development server exited with code $($Process.ExitCode) before becoming reachable."
      }
    }
    Start-Sleep -Milliseconds 500
  }

  throw "Language OS did not become reachable within $ReadyTimeoutSeconds seconds."
}

function Stop-OwnedServer {
  param($OwnedServer)

  if (-not $OwnedServer) {
    return $false
  }

  $processId = [int]$OwnedServer.Process.Id
  Write-LauncherLog "Stopping owned server host PID $processId."
  Start-Process `
    -FilePath $TaskKill `
    -ArgumentList "/PID $processId /T /F" `
    -WindowStyle Hidden `
    -Wait | Out-Null
  for ($attempt = 0; $attempt -lt 20; $attempt++) {
    if (-not (Get-Process -Id $processId -ErrorAction SilentlyContinue)) {
      Remove-StaleState
      Write-LauncherLog "Server host PID $processId stopped."
      return $true
    }
    Start-Sleep -Milliseconds 250
  }

  throw "The owned development-server process could not be stopped."
}

function Find-AppBrowser {
  $registryKeys = @(
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\msedge.exe",
    "HKLM:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe",
    "HKCU:\SOFTWARE\Microsoft\Windows\CurrentVersion\App Paths\chrome.exe"
  )
  foreach ($key in $registryKeys) {
    if (Test-Path -LiteralPath $key) {
      $candidate = (Get-ItemProperty -LiteralPath $key)."(default)"
      if ($candidate -and (Test-Path -LiteralPath $candidate)) {
        return [string]$candidate
      }
    }
  }
  return $null
}

function Open-LanguageOsWindow {
  if ($NoBrowser) {
    Write-LauncherLog "Browser opening suppressed for validation."
    return
  }

  $browser = Find-AppBrowser
  if ($browser) {
    Start-Process -FilePath $browser -ArgumentList "--app=$AppUrl", "--new-window" | Out-Null
    Write-LauncherLog "Opened app window with $browser."
    return
  }

  Start-Process $AppUrl | Out-Null
  Write-LauncherLog "No app-mode browser found; opened the default browser."
}

function Invoke-ServerHost {
  Initialize-StateDirectory
  try {
    Set-Location -LiteralPath $RepositoryPath
    $npm = Resolve-CommandPath "npm.cmd"
    $commandLine = "chcp 65001 > nul & `"$npm`" run dev >> `"$ServerLogPath`" 2>&1"
    & $env:ComSpec /d /s /c $commandLine
    $exitCode = $LASTEXITCODE
    Add-Content -LiteralPath $ServerLogPath -Value "Development server exited with code $exitCode." -Encoding UTF8
    exit $exitCode
  } catch {
    Add-Content -LiteralPath $ServerLogPath -Value "Server host failure: $($_.Exception.Message)" -Encoding UTF8
    exit 1
  }
}

function Invoke-Open {
  if (Test-LanguageOsHealth) {
    Write-LauncherLog "Reusing an already-running Language OS server."
    Open-LanguageOsWindow
    return
  }

  $ownedServer = Get-OwnedServer
  if ($ownedServer) {
    Write-LauncherLog "Owned server host PID $($ownedServer.Process.Id) is still starting."
    Wait-ForLanguageOs -Process $ownedServer.Process
    Open-LanguageOsWindow
    return
  }

  if (Test-DevPortOpen) {
    throw "Port 3000 is already in use by something other than a healthy Language OS development server."
  }

  Initialize-SessionLog
  $prerequisites = Assert-RepositoryPrerequisites
  Sync-DependenciesIfNeeded -NpmPath $prerequisites.Npm
  $process = Start-ServerHost
  Wait-ForLanguageOs -Process $process
  Open-LanguageOsWindow
}

function Invoke-Restart {
  $ownedServer = Get-OwnedServer
  if ($ownedServer) {
    Stop-OwnedServer -OwnedServer $ownedServer | Out-Null
  } elseif (Test-LanguageOsHealth) {
    throw "A Language OS server is running, but it was not started by this launcher. It was left untouched."
  } elseif (Test-DevPortOpen) {
    throw "Port 3000 is in use by another process. It was left untouched."
  }

  Invoke-Open
}

function Invoke-Stop {
  $ownedServer = Get-OwnedServer
  if ($ownedServer) {
    Stop-OwnedServer -OwnedServer $ownedServer | Out-Null
    Show-Information "The Language OS development server has stopped."
    return
  }

  if (Test-LanguageOsHealth) {
    throw "Language OS is running, but it was not started by this launcher. It was left untouched."
  }
  if (Test-DevPortOpen) {
    throw "Port 3000 belongs to another process. It was left untouched."
  }

  Remove-StaleState
  Show-Information "The Language OS development server is not running."
}

function Invoke-ViewLog {
  Initialize-StateDirectory
  if (-not (Test-Path -LiteralPath $ServerLogPath)) {
    "No Language OS Dev server log has been created yet." | Set-Content -LiteralPath $ServerLogPath -Encoding UTF8
  }
  Start-Process -FilePath "notepad.exe" -ArgumentList "`"$ServerLogPath`"" | Out-Null
}

if ($Action -eq "Server") {
  Invoke-ServerHost
}

Initialize-StateDirectory
$mutex = New-Object System.Threading.Mutex($false, "Local\LanguageOSDevLauncher")
$mutexAcquired = $false
try {
  try {
    $mutexAcquired = $mutex.WaitOne([TimeSpan]::FromSeconds(20))
  } catch [System.Threading.AbandonedMutexException] {
    $mutexAcquired = $true
  }
  if (-not $mutexAcquired) {
    throw "Another Language OS launcher action is already in progress."
  }

  Write-LauncherLog "Action $Action requested."
  switch ($Action) {
    "Open" { Invoke-Open }
    "Restart" { Invoke-Restart }
    "Stop" { Invoke-Stop }
    "ViewLog" { Invoke-ViewLog }
  }
  Write-LauncherLog "Action $Action completed."
} catch {
  $message = $_.Exception.Message
  Write-LauncherLog "Action $Action failed: $message"
  Show-Failure $message
  exit 1
} finally {
  if ($mutexAcquired) {
    $mutex.ReleaseMutex()
  }
  $mutex.Dispose()
}
