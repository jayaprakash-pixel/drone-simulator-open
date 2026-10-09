# Starts ArduCopter SITL natively on Windows (no WSL, no admin rights): ArduPilot's own prebuilt Cygwin build from
# firmware.ardupilot.org/Tools/MissionPlanner/sitl/CopterStable, downloaded once into sim\sitl-win (git-ignored).
# Only ArduCopter.elf and its DLLs are downloaded; SITL starts from its built-in
# default parameters. MAVLink goes out over UDP to 127.0.0.1:14550, where the bridge or sim\spike.py listens.
#   powershell -File sim\start-sitl.ps1 [-HomePos "26.4897,74.5511,0,0"] [-Wipe] [-Extra "--speedup 1"]
param(
  [string]$HomePos = '26.4897,74.5511,0,0',  # lat,lon,alt (m above the ground the sim assumes),heading
  [switch]$Wipe,                            # start from default parameters (deletes eeprom.bin)
  [string]$Extra = ''
)
$ErrorActionPreference = 'Stop'
$bin = Join-Path $PSScriptRoot 'sitl-win'
$run = Join-Path $PSScriptRoot 'run'
$base = 'https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/CopterStable'
$files = 'ArduCopter.elf', 'cygwin1.dll', 'cygstdc++-6.dll', 'cyggcc_s-seh-1.dll', 'cyggcc_s-1.dll', 'cygatomic-1.dll',
         'cyggomp-1.dll', 'cygiconv-2.dll', 'cygintl-8.dll', 'cygquadmath-0.dll', 'cygssp-0.dll'
New-Item -ItemType Directory -Force $bin, $run | Out-Null
foreach ($f in $files) {
  $to = Join-Path $bin $f
  if (-not (Test-Path $to)) { Write-Host "download $f"; Invoke-WebRequest "$base/$f" -OutFile $to -UseBasicParsing }
}
if ($Wipe) { Remove-Item (Join-Path $run 'eeprom.bin') -ErrorAction SilentlyContinue }
Set-Location $run  # SITL writes eeprom.bin, logs and terrain here
# loopback only: by default SITL listens on 0.0.0.0 TCP 5762/5763 (SERIAL1/2) and UDP 5501 (RC in). These make SERIAL1/2
# UDP clients of 127.0.0.1 and give RC in a random port, so nothing listens (measured 2026-10-09, docs/spike.md)
$sitlArgs = @('--model', '+', '--home', $HomePos, '-I0', '--defaults', '../copter-min.parm', '--serial0', 'udpclient:127.0.0.1:14550',
              '--serial1', 'udpclient:127.0.0.1:14561', '--serial2', 'udpclient:127.0.0.1:14562', '--rc-in-port', '0') + ($Extra -split ' ' | Where-Object { $_ })
Write-Host "ArduCopter.elf $($sitlArgs -join ' ')"
# not `& ArduCopter.elf`: PowerShell hands a .elf file to the Windows file association (an "Open with" dialog), not CreateProcess
$p = Start-Process -FilePath (Join-Path $bin 'ArduCopter.elf') -ArgumentList $sitlArgs -NoNewWindow -PassThru
Write-Host "SITL PID $($p.Id); Ctrl+C or Stop-Process -Id $($p.Id) stops it"
$p.WaitForExit()
