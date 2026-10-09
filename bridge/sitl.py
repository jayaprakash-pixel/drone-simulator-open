"""Start and stop the native-Windows ArduCopter SITL (sim/sitl-win, see docs/spike.md).

Launched directly, not through sim/start-sitl.ps1: started from a child PowerShell with `&`, SITL sent nothing at all
(measured 2026-10-09). Arguments match start-sitl.ps1: MAVLink to UDP 127.0.0.1:14550 (live profile) and
nothing listening on any port.
"""
from __future__ import annotations

import os
import signal
import subprocess
from pathlib import Path

SIM = Path(__file__).resolve().parents[1] / "sim"
ELF = SIM / "sitl-win" / "ArduCopter.elf"

# Two profiles, so checks can run beside the PM2 bridge without touching its simulator (P2A.9.1). "live" (the default,
# the PM2 bridge): sim/run, UDP 14550/14561/14562. "test" (DW_SIM_PROFILE=test, set by every check): sim/run-test,
# UDP 14650/14661/14662. Read at call time, so a script may set the variable after importing this module.
PROFILES = {"live": ("run", (14550, 14561, 14562)), "test": ("run-test", (14650, 14661, 14662))}


def profile() -> str:
    return "test" if os.environ.get("DW_SIM_PROFILE") == "test" else "live"


def run_dir() -> Path:
    return SIM / PROFILES[profile()][0]


def udp_ports() -> tuple[int, int, int]:
    return PROFILES[profile()][1]


def args(lat: float, lon: float, alt: float = 0.0, heading: float = 0.0, speedup: float = 1.0) -> list[str]:
    a, b, c = udp_ports()
    return [str(ELF), "--model", "+", "--home", f"{lat},{lon},{alt},{heading}", "-I0", "--defaults", "../copter-min.parm",
            "--serial0", f"udpclient:127.0.0.1:{a}", "--serial1", f"udpclient:127.0.0.1:{b}",
            "--serial2", f"udpclient:127.0.0.1:{c}", "--rc-in-port", "0", "--speedup", str(speedup)]


def pidfile() -> Path:
    return run_dir() / "sitl.pid"


def stop_stale() -> None:
    """Kills the simulator an earlier start left running (its PID is in <run dir>/sitl.pid), but only if that PID is
    still an ArduCopter.elf: a killed bridge cannot stop its child, and two simulators would fight over one UDP port. Only
    this profile's PID file is read, so a check never stops the PM2 bridge's simulator."""
    try:
        pid = int(pidfile().read_text())
    except (OSError, ValueError):
        return
    out = subprocess.run(["tasklist", "/FI", f"PID eq {pid}", "/FO", "CSV", "/NH"], capture_output=True, text=True).stdout
    if "ArduCopter.elf" in out:
        os.kill(pid, signal.SIGTERM)  # TerminateProcess on Windows
    pidfile().unlink(missing_ok=True)


def start(lat: float, lon: float, alt=0.0, heading=0.0, wipe=True, speedup=1.0) -> subprocess.Popen:
    """Starts SITL with its home at lat, lon, alt (metres above mean sea level), output to <run dir>/sitl.log."""
    if not ELF.exists():
        raise FileNotFoundError(f"{ELF} missing: run sim\\start-sitl.ps1 once (docs/spike.md)")
    RUN = run_dir()
    RUN.mkdir(exist_ok=True)
    stop_stale()
    if wipe:  # parameters and the terrain SITL cached from earlier runs (its "SD card")
        (RUN / "eeprom.bin").unlink(missing_ok=True)
        for f in (RUN / "terrain").glob("*.DAT"):
            f.unlink()
    log = open(RUN / "sitl.log", "w")
    p = subprocess.Popen(args(lat, lon, alt, heading, speedup), cwd=RUN, stdout=log, stderr=subprocess.STDOUT, stdin=subprocess.DEVNULL)
    pidfile().write_text(str(p.pid))
    return p


def stop(proc: subprocess.Popen | None) -> None:
    if proc and proc.poll() is None:
        proc.kill()
        proc.wait(10)
    if proc:
        pidfile().unlink(missing_ok=True)
