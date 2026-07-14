param(
  [Parameter(Mandatory = $true)]
  [string] $Amalgamation,

  [Parameter(Mandatory = $false)]
  [string] $TargetRoot
)

$ErrorActionPreference = "Stop"
Set-StrictMode -Version Latest

$OpenSslVersion = "3.5.7"
$OpenSslSha256 = "a8c0d28a529ca480f9f36cf5792e2cd21984552a3c8e4aa11a24aa31aeac98e8"
$ElectronVersion = "43.1.0"
$ScriptRoot = (Resolve-Path (Join-Path $PSScriptRoot "..\..")).Path
$Root = if ($PSBoundParameters.ContainsKey("TargetRoot")) {
  (Resolve-Path $TargetRoot).Path
}
else {
  $ScriptRoot
}
$RunnerTemp = if ($env:RUNNER_TEMP) { $env:RUNNER_TEMP } else { [IO.Path]::GetTempPath() }
$Archive = Join-Path $RunnerTemp "openssl-$OpenSslVersion.tar.gz"
$SourceRoot = Join-Path $RunnerTemp "openssl-$OpenSslVersion"

if (-not [Environment]::Is64BitOperatingSystem) {
  throw "The Windows x64 application build requires a 64-bit runner."
}

foreach ($RequiredFile in @("sqlite3.c", "sqlite3.h")) {
  if (-not (Test-Path (Join-Path $Amalgamation $RequiredFile))) {
    throw "Missing SQLCipher amalgamation file: $RequiredFile"
  }
}

Remove-Item $Archive -Force -ErrorAction SilentlyContinue
Remove-Item $SourceRoot -Recurse -Force -ErrorAction SilentlyContinue
Invoke-WebRequest -Uri "https://www.openssl.org/source/openssl-$OpenSslVersion.tar.gz" -OutFile $Archive

$ActualHash = (Get-FileHash -Algorithm SHA256 $Archive).Hash.ToLowerInvariant()
if ($ActualHash -ne $OpenSslSha256) {
  throw "OpenSSL archive digest mismatch: $ActualHash"
}

& tar.exe -xzf $Archive -C $RunnerTemp
if ($LASTEXITCODE -ne 0) { throw "OpenSSL archive extraction failed." }

$VsWhere = Join-Path ${env:ProgramFiles(x86)} "Microsoft Visual Studio\Installer\vswhere.exe"
$VsInstall = (& $VsWhere -latest -products * -requires Microsoft.VisualStudio.Component.VC.Tools.x86.x64 -property installationPath).Trim()
if (-not $VsInstall) { throw "A Visual C++ toolchain was not found." }
$VcVars = Join-Path $VsInstall "VC\Auxiliary\Build\vcvars64.bat"

function Invoke-DeveloperCommand([string] $Command) {
  & $env:COMSPEC /d /c "call `"$VcVars`" && $Command"
  if ($LASTEXITCODE -ne 0) {
    throw "Developer command failed with exit code $LASTEXITCODE."
  }
}

$Configure = "cd /d `"$SourceRoot`" && perl Configure VC-WIN64A no-shared no-module no-tests no-docs no-apps no-asm --prefix=`"$SourceRoot\install`" --openssldir=`"$SourceRoot\ssl`" --libdir=lib && nmake"
Invoke-DeveloperCommand $Configure

$LibCrypto = Join-Path $SourceRoot "libcrypto.lib"
if (-not (Test-Path $LibCrypto)) { throw "Static libcrypto.lib was not produced." }

node (Join-Path $ScriptRoot "scripts\native\patch-better-sqlite3.mjs") $Root
if ($LASTEXITCODE -ne 0) { throw "Binding patch failed." }

$ModuleRoot = Join-Path $Root "node_modules\better-sqlite3"
Remove-Item (Join-Path $ModuleRoot "build") -Recurse -Force -ErrorAction SilentlyContinue
$PreviousCl = $env:CL
$PreviousLink = $env:LINK
try {
  $env:CL = "/DSQLITE_HAS_CODEC /DSQLCIPHER_CRYPTO_OPENSSL /DSQLITE_THREADSAFE=1 /DSQLITE_TEMP_STORE=2 /DSQLITE_EXTRA_INIT=sqlcipher_extra_init /DSQLITE_EXTRA_SHUTDOWN=sqlcipher_extra_shutdown /DSQLITE_ENABLE_FTS5 /DSQLITE_DQS=0 /DSQLITE_OMIT_LOAD_EXTENSION /I`"$SourceRoot\include`""
  $env:LINK = "/LIBPATH:`"$SourceRoot`" libcrypto.lib WS2_32.LIB GDI32.LIB ADVAPI32.LIB CRYPT32.LIB USER32.LIB"
  Push-Location $ModuleRoot
  try {
    $NodeGyp = Join-Path $Root "node_modules\.bin\node-gyp.cmd"
    $NodeGypArguments = @(
      "rebuild"
      "--release"
      "--target=$ElectronVersion"
      "--arch=x64"
      "--dist-url=https://electronjs.org/headers"
      "--sqlite3=$Amalgamation"
    )
    & $NodeGyp @NodeGypArguments
    if ($LASTEXITCODE -ne 0) { throw "Electron native binding build failed." }
  }
  finally {
    Pop-Location
  }
}
finally {
  $env:CL = $PreviousCl
  $env:LINK = $PreviousLink
}

$Binding = Join-Path $ModuleRoot "build\Release\better_sqlite3.node"
if (-not (Test-Path $Binding)) { throw "Native binding output is missing." }

$Dump = Join-Path $RunnerTemp "better-sqlite3-dependencies.txt"
Invoke-DeveloperCommand "dumpbin /headers `"$Binding`" > `"$Dump`" && dumpbin /dependents `"$Binding`" >> `"$Dump`""
$DumpText = Get-Content $Dump -Raw
if ($DumpText -notmatch "machine \(x64\)") {
  throw "The native binding is not an x64 image."
}
if ($DumpText -match "(?i)lib(?:crypto|ssl).*\.dll") {
  throw "The native binding unexpectedly depends on a shared OpenSSL DLL."
}
Write-Host "Application binding is x64 and has no shared OpenSSL dependency."
