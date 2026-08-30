$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$outputDirectory = Join-Path $projectRoot "docs\gorseller"
$devServer = "http://127.0.0.1:1430"

try {
    Invoke-WebRequest -Uri $devServer -UseBasicParsing -TimeoutSec 5 | Out-Null
} catch {
    throw "Line CLI geliştirme sunucusu çalışmıyor. Ayrı bir terminalde 'pnpm dev' komutunu başlatın."
}

$chromeCandidates = @(
    "C:\Program Files\Google\Chrome\Application\chrome.exe",
    "C:\Program Files (x86)\Google\Chrome\Application\chrome.exe"
)
$chrome = $chromeCandidates | Where-Object { Test-Path -LiteralPath $_ } | Select-Object -First 1
if (-not $chrome) {
    throw "Google Chrome bulunamadı; GitHub ekran görüntüleri üretilemedi."
}

New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null

$captures = @(
    @{ Theme = "light"; File = "line-cli-acik-tema.png" },
    @{ Theme = "dark"; File = "line-cli-koyu-tema.png" }
)

foreach ($capture in $captures) {
    $target = Join-Path $outputDirectory $capture.File
    $profile = Join-Path $env:TEMP ("line-cli-docs-" + $capture.Theme + "-" + [guid]::NewGuid().ToString("N"))
    if (Test-Path -LiteralPath $target) {
        Remove-Item -LiteralPath $target -Force
    }

    & $chrome `
        "--headless=new" `
        "--no-first-run" `
        "--no-default-browser-check" `
        "--disable-gpu" `
        "--hide-scrollbars" `
        "--user-data-dir=$profile" `
        "--window-size=1440,1000" `
        "--virtual-time-budget=3500" `
        "--screenshot=$target" `
        "$devServer/?theme=$($capture.Theme)"

    for ($attempt = 0; $attempt -lt 30 -and -not (Test-Path -LiteralPath $target); $attempt++) {
        Start-Sleep -Milliseconds 500
    }
    if (-not (Test-Path -LiteralPath $target)) {
        throw "Ekran görüntüsü üretilemedi: $($capture.Theme)"
    }
}

Get-Item -LiteralPath ($captures | ForEach-Object { Join-Path $outputDirectory $_.File }) |
    Select-Object FullName, Length, LastWriteTime
