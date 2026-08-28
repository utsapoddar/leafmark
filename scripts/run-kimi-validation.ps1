param(
  [Parameter(Mandatory = $true)]
  [string]$BookPath,
  [string]$LogPath = "artifacts\kimi-validation.log",
  [int]$MaxPages = 80
)

$ErrorActionPreference = 'Stop'
$validationRoot = Split-Path -Parent $PSScriptRoot
$validationLog = [System.IO.Path]::GetFullPath((Join-Path $validationRoot $LogPath))
$validationOutput = [System.IO.Path]::GetFullPath((Join-Path $validationRoot 'artifacts\behave-80-pages-kimi-k2.6.json'))
New-Item -ItemType Directory -Force -Path (Split-Path -Parent $validationLog) | Out-Null

Write-Host 'Leafmark Kimi validation' -ForegroundColor Cyan
Write-Host "Book: $BookPath"
Write-Host "Scope: first $MaxPages pages"
Write-Host 'Destination: Kimi Global (api.moonshot.ai), model kimi-k2.6'
Write-Host 'The request may incur Kimi API charges.' -ForegroundColor Yellow
$validationSecureKey = Read-Host 'Paste Kimi Global API key (input is hidden)' -AsSecureString
$validationPointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($validationSecureKey)

try {
  $env:KIMI_API_KEY = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($validationPointer)
  Set-Location -LiteralPath $validationRoot
  & npm run guide:run -- --file $BookPath --provider kimi --model kimi-k2.6 --max-pages $MaxPages --output $validationOutput 2>&1 | Tee-Object -FilePath $validationLog
  $validationExitCode = $LASTEXITCODE
  Add-Content -LiteralPath $validationLog -Value "EXIT_CODE=$validationExitCode"
} catch {
  $validationExitCode = 1
  $_ | Out-String | Tee-Object -FilePath $validationLog -Append | Write-Host
  Add-Content -LiteralPath $validationLog -Value 'EXIT_CODE=1'
} finally {
  Remove-Item Env:KIMI_API_KEY -ErrorAction SilentlyContinue
  if ($validationPointer -ne [IntPtr]::Zero) {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($validationPointer)
  }
}

if ($validationExitCode -eq 0) {
  Write-Host 'Validation passed. The key has been erased from this process.' -ForegroundColor Green
} else {
  Write-Host 'Validation failed. The key has been erased from this process.' -ForegroundColor Red
}
Read-Host 'Press Enter to close this window'
exit $validationExitCode
