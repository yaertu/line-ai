$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$desktop = [Environment]::GetFolderPath("Desktop")
$releaseExecutable = Join-Path $projectRoot "src-tauri\target\release\line-cli.exe"
$desktopExecutable = Join-Path $desktop "Line CLI.exe"
$desktopSourceZip = Join-Path $desktop "line-cli-src.zip"

function Get-Sha256Hash {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $algorithm = [System.Security.Cryptography.SHA256]::Create()
        try {
            return ([System.BitConverter]::ToString($algorithm.ComputeHash($stream))).Replace("-", "")
        }
        finally {
            $algorithm.Dispose()
        }
    }
    finally {
        $stream.Dispose()
    }
}

Set-Location -LiteralPath $projectRoot

$dirtyFiles = git status --porcelain
if ($LASTEXITCODE -ne 0) {
    throw "Git çalışma ağacı okunamadı."
}
if ($dirtyFiles) {
    throw "Temiz bir kaynak paketi için önce değişiklikleri commit edin."
}

& pnpm verify
if ($LASTEXITCODE -ne 0) { throw "Frontend doğrulaması başarısız." }

& cargo test --manifest-path "src-tauri\Cargo.toml"
if ($LASTEXITCODE -ne 0) { throw "Rust testleri başarısız." }

& pnpm tauri:build
if ($LASTEXITCODE -ne 0) { throw "Native Windows derlemesi başarısız." }
if (-not (Test-Path -LiteralPath $releaseExecutable)) {
    throw "Derlenen Line CLI çalıştırılabilir dosyası bulunamadı."
}

Copy-Item -LiteralPath $releaseExecutable -Destination $desktopExecutable -Force
if (Test-Path -LiteralPath $desktopSourceZip) {
    Remove-Item -LiteralPath $desktopSourceZip -Force
}
& git archive --format=zip --output=$desktopSourceZip HEAD
if ($LASTEXITCODE -ne 0) { throw "Kaynak ZIP üretilemedi." }

$sourceHash = Get-Sha256Hash -Path $releaseExecutable
$desktopHash = Get-Sha256Hash -Path $desktopExecutable
if ($sourceHash -ne $desktopHash) {
    throw "Masaüstü EXE kopyasının SHA-256 doğrulaması başarısız."
}

$artifacts = @(
    Get-Item -LiteralPath $desktopExecutable
    Get-Item -LiteralPath $desktopSourceZip
)

$artifacts | ForEach-Object {
    [PSCustomObject]@{
        Dosya = $_.FullName
        Boyut = $_.Length
        SHA256 = Get-Sha256Hash -Path $_.FullName
    }
} | Format-Table -AutoSize

$signature = Get-AuthenticodeSignature -LiteralPath $desktopExecutable
Write-Output "Authenticode: $($signature.Status)"
