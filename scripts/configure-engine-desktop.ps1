param([string]$AccessFile = (Join-Path $env:USERPROFILE '.lineai\engine-operator.json'))
$ErrorActionPreference = 'Stop'
$access = Get-Content -LiteralPath $AccessFile -Raw | ConvertFrom-Json
$engineKey = ([string]$access.engineKey).Trim()
if ($engineKey.Length -ne 55 -or -not $engineKey.StartsWith('lai_sk_live_') -or $engineKey.Substring(12) -match '[^A-Za-z0-9_-]') { throw 'Geçersiz Engine anahtarı.' }
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class LineEngineCredential {
 [StructLayout(LayoutKind.Sequential, CharSet=CharSet.Unicode)]
 public struct Credential {
  public uint Flags; public uint Type; public string TargetName; public string Comment;
  public System.Runtime.InteropServices.ComTypes.FILETIME LastWritten;
  public uint CredentialBlobSize; public IntPtr CredentialBlob; public uint Persist;
  public uint AttributeCount; public IntPtr Attributes; public string TargetAlias; public string UserName;
 }
 [DllImport("advapi32.dll",EntryPoint="CredWriteW",CharSet=CharSet.Unicode,SetLastError=true)]
 public static extern bool Write(ref Credential credential,uint flags);
}
'@
$bytes = [Text.Encoding]::Unicode.GetBytes($engineKey)
$pointer = [Runtime.InteropServices.Marshal]::AllocHGlobal($bytes.Length)
try {
 [Runtime.InteropServices.Marshal]::Copy($bytes,0,$pointer,$bytes.Length)
 $credential = New-Object LineEngineCredential+Credential
 $credential.Type=1
 $credential.TargetName='engine-api-key-v1.app.lineai.desktop'
 $credential.UserName='engine-api-key-v1'
 $credential.Comment='Line AI Engine'
 $credential.CredentialBlobSize=$bytes.Length
 $credential.CredentialBlob=$pointer
 $credential.Persist=2
 if (-not [LineEngineCredential]::Write([ref]$credential,0)) { throw 'Windows kimlik kasasına yazılamadı.' }
 Write-Output 'Line AI Engine anahtarı Windows kimlik kasasına kaydedildi.'
} finally {
 [Array]::Clear($bytes,0,$bytes.Length)
 for($i=0;$i -lt $credential.CredentialBlobSize;$i++){[Runtime.InteropServices.Marshal]::WriteByte($pointer,$i,0)}
 [Runtime.InteropServices.Marshal]::FreeHGlobal($pointer)
 $access=$null
 $engineKey=$null
}
