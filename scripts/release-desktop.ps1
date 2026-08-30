$ErrorActionPreference = "Stop"

$projectRoot = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$desktop = [Environment]::GetFolderPath("Desktop")
$releaseExecutable = Join-Path $projectRoot "src-tauri\target\release\line-ai.exe"
$desktopExecutable = Join-Path $desktop "Line AI.exe"
$desktopSourceZip = Join-Path $desktop "line-ai-src.zip"

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

function Get-PeCertificateTableStatus {
    param([Parameter(Mandatory = $true)][string]$Path)

    $stream = [System.IO.File]::OpenRead($Path)
    try {
        $reader = New-Object System.IO.BinaryReader($stream)
        try {
            if ($stream.Length -lt 64 -or $reader.ReadUInt16() -ne 0x5A4D) {
                return "InvalidPe"
            }

            $stream.Position = 0x3C
            $peOffset = $reader.ReadUInt32()
            if ($peOffset + 24 -gt $stream.Length) { return "InvalidPe" }

            $stream.Position = $peOffset
            if ($reader.ReadUInt32() -ne 0x00004550) { return "InvalidPe" }

            $optionalHeaderOffset = $peOffset + 24
            $stream.Position = $optionalHeaderOffset
            $magic = $reader.ReadUInt16()
            if ($magic -eq 0x10B) {
                $dataDirectoryOffset = $optionalHeaderOffset + 96
            }
            elseif ($magic -eq 0x20B) {
                $dataDirectoryOffset = $optionalHeaderOffset + 112
            }
            else {
                return "InvalidPe"
            }

            $certificateEntryOffset = $dataDirectoryOffset + 32
            if ($certificateEntryOffset + 8 -gt $stream.Length) { return "InvalidPe" }

            $stream.Position = $certificateEntryOffset
            $certificateFileOffset = $reader.ReadUInt32()
            $certificateSize = $reader.ReadUInt32()
            if ($certificateFileOffset -eq 0 -or $certificateSize -eq 0) {
                return "NotSigned"
            }
            if ([uint64]$certificateFileOffset + [uint64]$certificateSize -gt [uint64]$stream.Length) {
                return "InvalidCertificateTable"
            }

            return "PresentNotValidated"
        }
        finally {
            $reader.Dispose()
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
    throw "Derlenen Line AI çalıştırılabilir dosyası bulunamadı."
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

$signatureStatus = Get-PeCertificateTableStatus -Path $desktopExecutable
Write-Output "Authenticode: $signatureStatus"
