[CmdletBinding()]
param(
  [string]$RepositoryPath = "C:\Projects\Language OS",
  [switch]$Uninstall,
  [switch]$NonInteractive
)

Set-StrictMode -Version 2.0
$ErrorActionPreference = "Stop"

$AppName = "Language OS Dev"
$ControllerPath = Join-Path $RepositoryPath "tools\windows\LanguageOSDev.ps1"
$InstallerPath = Join-Path $RepositoryPath "tools\windows\Install-LanguageOSDev.ps1"
$WindowsPowerShell = Join-Path $env:SystemRoot "System32\WindowsPowerShell\v1.0\powershell.exe"
$ProgramsDirectory = [Environment]::GetFolderPath("Programs")
$PrimaryShortcutPath = Join-Path $ProgramsDirectory "Language OS Dev.lnk"
$ShortcutDirectory = Join-Path $ProgramsDirectory "Language OS Dev"
$StateDirectory = Join-Path ([Environment]::GetFolderPath("LocalApplicationData")) "Language OS Dev"
$IconPath = Join-Path $StateDirectory "LanguageOSDev.ico"

function Show-InstallerMessage {
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

function New-LauncherIcon {
  if (-not (Test-Path -LiteralPath $StateDirectory)) {
    New-Item -ItemType Directory -Path $StateDirectory -Force | Out-Null
  }

  Add-Type -AssemblyName System.Drawing
  $bitmap = New-Object System.Drawing.Bitmap 64, 64
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $graphics.Clear([System.Drawing.Color]::FromArgb(255, 7, 14, 25))
  $blue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 46, 158, 255))
  $lightBlue = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 104, 196, 255))
  try {
    $graphics.FillRectangle($blue, 8, 8, 24, 24)
    $graphics.FillRectangle($blue, 40, 8, 16, 16)
    $graphics.FillRectangle($blue, 8, 40, 16, 16)
    $graphics.FillRectangle($lightBlue, 32, 32, 24, 24)
    $handle = $bitmap.GetHicon()
    $icon = [System.Drawing.Icon]::FromHandle($handle)
    $stream = New-Object System.IO.FileStream($IconPath, [System.IO.FileMode]::Create)
    try {
      $icon.Save($stream)
    } finally {
      $stream.Dispose()
      $icon.Dispose()
    }
  } finally {
    $blue.Dispose()
    $lightBlue.Dispose()
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

function New-LauncherShortcut {
  param(
    [string]$Path,
    [string]$ScriptPath,
    [string]$Arguments,
    [string]$Description
  )

  $shell = New-Object -ComObject WScript.Shell
  $shortcut = $shell.CreateShortcut($Path)
  $shortcut.TargetPath = $WindowsPowerShell
  $shortcut.Arguments = "-NoLogo -NoProfile -ExecutionPolicy Bypass -WindowStyle Hidden -File `"$ScriptPath`" $Arguments"
  $shortcut.WorkingDirectory = $RepositoryPath
  $shortcut.Description = $Description
  $shortcut.IconLocation = "$IconPath,0"
  $shortcut.Save()
}

if ($Uninstall) {
  if (Test-Path -LiteralPath $ControllerPath) {
    & $WindowsPowerShell -NoLogo -NoProfile -ExecutionPolicy Bypass -File $ControllerPath -Action Stop -RepositoryPath $RepositoryPath -NonInteractive 2>$null
  }
  Remove-Item -LiteralPath $PrimaryShortcutPath -Force -ErrorAction SilentlyContinue
  Remove-Item -LiteralPath $ShortcutDirectory -Recurse -Force -ErrorAction SilentlyContinue
  Show-InstallerMessage "Language OS Dev shortcuts were removed. Logs remain in $StateDirectory."
  exit 0
}

if (-not (Test-Path -LiteralPath $ControllerPath -PathType Leaf)) {
  throw "The launcher controller was not found at $ControllerPath."
}
if (-not (Test-Path -LiteralPath $InstallerPath -PathType Leaf)) {
  throw "The launcher installer was not found at $InstallerPath."
}
if (-not (Test-Path -LiteralPath $WindowsPowerShell -PathType Leaf)) {
  throw "Windows PowerShell was not found at $WindowsPowerShell."
}

New-Item -ItemType Directory -Path $ShortcutDirectory -Force | Out-Null
New-LauncherIcon

New-LauncherShortcut `
  -Path $PrimaryShortcutPath `
  -ScriptPath $ControllerPath `
  -Arguments "-Action Open -RepositoryPath `"$RepositoryPath`"" `
  -Description "Open Language OS in its local development environment"

New-LauncherShortcut `
  -Path (Join-Path $ShortcutDirectory "Restart Language OS Dev Server.lnk") `
  -ScriptPath $ControllerPath `
  -Arguments "-Action Restart -RepositoryPath `"$RepositoryPath`"" `
  -Description "Restart the Language OS development server"

New-LauncherShortcut `
  -Path (Join-Path $ShortcutDirectory "Stop Language OS Dev Server.lnk") `
  -ScriptPath $ControllerPath `
  -Arguments "-Action Stop -RepositoryPath `"$RepositoryPath`"" `
  -Description "Stop the Language OS development server"

New-LauncherShortcut `
  -Path (Join-Path $ShortcutDirectory "View Language OS Dev Log.lnk") `
  -ScriptPath $ControllerPath `
  -Arguments "-Action ViewLog -RepositoryPath `"$RepositoryPath`"" `
  -Description "Open the Language OS development-server log"

New-LauncherShortcut `
  -Path (Join-Path $ShortcutDirectory "Uninstall Language OS Dev.lnk") `
  -ScriptPath $InstallerPath `
  -Arguments "-Uninstall -RepositoryPath `"$RepositoryPath`"" `
  -Description "Remove the Language OS Dev Start Menu shortcuts"

Show-InstallerMessage "Language OS Dev is installed in Start. Search for Language OS Dev, then right-click the main shortcut to pin it to the taskbar."

