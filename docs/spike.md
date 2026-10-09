# Phase 2a spike: ArduCopter SITL on this laptop

Route tried first (decisions.md, P0.3.2 option a): ArduPilot's own prebuilt **native-Windows** ArduCopter SITL, the
Cygwin build that Mission Planner uses, from `https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/CopterStable/`
(ArduPilot commit dated 2026-09-04). No WSL, no virtual machine, no administrator rights, no restart. About 18.5 MB,
kept in `sim\sitl-win\` (git-ignored); SITL's own files (eeprom.bin, logs) go to `sim\run\` (git-ignored).

Status 2026-10-08: the scripts were written but not run (Claude's permission check refused the download). On 2026-10-09 the
owner authorised exactly this download and run (decisions.md); only ArduCopter.elf and its DLLs, no copter.parm.

## Steps (normal PowerShell window, no admin needed)

```powershell
cd 
# 1. one time: Python packages for the bridge and the spike
python -m venv bridge\.venv
bridge\.venv\Scripts\python -m pip install -r bridge\requirements.txt

# 2. start SITL; it downloads the 12 files on its first run, then keeps running in this window (Ctrl+C stops it)
powershell -ExecutionPolicy Bypass -File sim\start-sitl.ps1 -Wipe
```

In a **second** window:

```powershell
cd 
bridge\.venv\Scripts\python sim\spike.py --heartbeat   # P2A.1.2: HEARTBEAT within 60 s
bridge\.venv\Scripts\python sim\spike.py               # P2A.1.3: GPS fix 3, arm, climb to 10 m, land, disarm
bridge\.venv\Scripts\python sim\spike.py --measure     # P2A.1.4: message rates and terrain parameters
```

`python sim\spike.py --measure --start` (with no SITL window open) launches SITL itself and also times the start.

If Windows Firewall asks about `ArduCopter.elf`, allow **private networks** only; it talks to 127.0.0.1.

## Downloaded files (2026-10-09, from https://firmware.ardupilot.org/Tools/MissionPlanner/sitl/CopterStable/)

| File | Bytes | SHA-256 |
|---|---|---|
| ArduCopter.elf | 10,960,003 | `9b6d760075938921ef298ed4e98ec5059517e19574eb902655d2704dce5d9463` |
| cygatomic-1.dll | 89,614 | `87f4cf57db1befe777b3e22e3cc4e81b2dbcff386a587e7f3d265f706340bb15` |
| cyggcc_s-1.dll | 111,118 | `002738f3cf6e984a8454af4204dd55d65780664d0fca8b4971a8f1e6c85ccd73` |
| cyggcc_s-seh-1.dll | 142,867 | `f9a352fa9215ceb9a35b67ef8c7f178906a9dcc40b3819182b63f93fecb4faea` |
| cyggomp-1.dll | 159,261 | `46b4dd8bbc76ea82b50ac3f70397cd295896e23ae4bf0a1a7a013769599bf00c` |
| cygiconv-2.dll | 1,104,915 | `e433ab6680eb509b5395f637137775dacebbc6e1ed3b564474aa87f0ca35379a` |
| cygintl-8.dll | 108,051 | `9d0c063a226965e61664bdd9b771b5d0ee16b5214720b6f0086868e04fe67cdc` |
| cygquadmath-0.dll | 509,966 | `75c70089e945bb5530eff463391383d6edc125b0b992ea29769a71c371d8c88e` |
| cygssp-0.dll | 10,766 | `d32da41f13052d0fe4ee3fa1be11823425a8a73d1979df5a4e55280539009133` |
| cygstdc++-6.dll | 2,316,819 | `d1c43fefb793471cb2e18de4bb5e96a026f7dacbbf80b2653ea751e24c4aa2ba` |
| cygwin1.dll | 3,234,357 | `d66788fce4ef1ce787fc1a83f2dd1e063e58bbf0d48ad93164ee195a983c035e` |

## What the scripts do

- `sim/start-sitl.ps1`: downloads the binary and the Cygwin DLLs once (nothing else);
  starts `ArduCopter.elf --model + --home 26.4897,74.5511,0,0 -I0 --serial0 udpclient:127.0.0.1:14550` with built-in default parameters.
  `-HomePos lat,lon,alt,heading` changes the home; `-Wipe` resets parameters.
- `sim/spike.py`: listens on UDP 14550 (the port the bridge will use), asks for position, attitude, GPS, battery and HUD at 25 per
  second, waits for GPS fix 3, switches to GUIDED, arms (retrying while SITL's pre-arm checks settle), takes off to 10 m,
  switches to LAND and waits for ArduCopter to disarm itself. Exit code 0 only if every step passed.

## If the native build fails

Fallback (b): WSL2 + Ubuntu with ArduPilot's prebuilt Linux `arducopter`. It needs `wsl --install` from an admin
terminal, a restart and a `.wslconfig` memory cap (this laptop has 7.3 GB). Record what failed here first.

## Results

(none yet: paste the three outputs here, or tell Claude to run them once SITL is allowed)
