param([string]$Source, [string]$Destination, [switch]$Independent)
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Windows.Forms
if (-not $Source) {
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Select a saved VectorCraft document'
    $picker.Filter = 'VectorCraft document (*.vectorcraft)|*.vectorcraft'
    if ($picker.ShowDialog() -ne 'OK') { exit }
    $Source = $picker.FileName
}
$Source = (Resolve-Path -LiteralPath $Source).Path
if (-not $Destination) {
    $stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
    $Destination = Join-Path (Split-Path -LiteralPath $Source) ([IO.Path]::GetFileNameWithoutExtension($Source) + '_Illustrator_' + $stamp + '.ai')
}
$nodeCmd = Get-Command node.exe -ErrorAction SilentlyContinue
$nodePath = if ($nodeCmd) { $nodeCmd.Source } else { Join-Path $env:USERPROFILE '.cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe' }
if (-not (Test-Path -LiteralPath $nodePath)) { throw 'Node.js was not found. Install Node.js or run from a terminal that provides node.exe.' }
if ($Independent) {
    & $nodePath (Join-Path $PSScriptRoot 'export-native.mjs') $Source $Destination
    if ($LASTEXITCODE -ne 0) { throw 'Independent export failed; see the error above.' }
    Write-Host "Saved: $Destination"
    exit
}
$cliPath = 'D:\Program Files\VectorCraft\vectorcraft-cli.exe'
if (-not (Test-Path -LiteralPath $cliPath)) {
    $picker = New-Object System.Windows.Forms.OpenFileDialog
    $picker.Title = 'Locate vectorcraft-cli.exe'
    $picker.Filter = 'VectorCraft CLI|vectorcraft-cli.exe'
    if ($picker.ShowDialog() -ne 'OK') { exit }
    $cliPath = $picker.FileName
}
& $nodePath (Join-Path $PSScriptRoot 'vectorcraft-to-illustrator.cjs') $Source $Destination $cliPath
if ($LASTEXITCODE -ne 0) { throw 'Conversion failed; see the error above and the report file.' }
Write-Host "Saved: $Destination"
