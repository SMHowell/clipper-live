import os
import logging
import time
from pathlib import Path
from datetime import datetime
from typing import Dict, List, Any, Union
from contextlib import nullcontext
import threading

import numpy as np
import spiceypy as sp
from fastapi import FastAPI, Query, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from astropy.time import Time
from astropy.table import Table
from astropy.coordinates import SkyCoord, ICRS, FK5, BarycentricTrueEcliptic
from astropy import units as u
from pydantic import BaseModel 
from spiceypy.utils.exceptions import NotFoundError

logger = logging.getLogger("uvicorn.error")

# Definte API instance
app = FastAPI() 

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # or ["http://192.168.1.42:3000"]
    allow_methods=["*"],
    allow_headers=["*"],
    )

BASE_DIR  = Path(__file__).resolve().parent
SPICE_DIR = BASE_DIR / "SPICE"
LOAD_ORDER = ["NAIF", "NaturalBodies", "Clipper", "Optional"]

def ensure_kernels():
    """
    Furnish every file in SPICE/NAIF, then NaturalBodies, then Clipper, then Optional.
    """
    for subdir in LOAD_ORDER:
        dirpath = SPICE_DIR / subdir
        if not dirpath.is_dir():
            continue
        # sort ensures a reproducible order within each folder
        for kernel_path in sorted(dirpath.iterdir()):
            # you can also filter by suffix if you want only .bsp/.tpc/etc:
            # if kernel_path.suffix.lower() not in {".bsp", ".tpc", ".tls", ".tm"}:
            #     continue
            sp.furnsh(str(kernel_path))
 
# Load  meta‐kernel at import time
t0 = time.perf_counter()
ensure_kernels()
t1 = time.perf_counter()

class AttResponse(BaseModel):
    quat: list[float]  # [x,y,z,w]

DISABLE_SPICE_LOCK=1
# Concurrency lock for SPICE calls
# if TESTING=1 in your env, use a no‐op context manager
if os.getenv("DISABLE_SPICE_LOCK") == "0":
    spice_lock = nullcontext()
else:
    spice_lock = threading.Lock()
spice_lock = threading.Lock()

KM_PER_AU = 1.495978707e8  # km in one AU

BODY_IDS = {
"Sun":  10,
"Europa": 502,
"Jupiter": 599,
"Io": 501,
"Ganymede": 503,
"Callisto": 504,
"Mercury": 199,
"Venus": 299,
"Earth": 399,
"Moon": 301,
"Mars": 499,
"Saturn": 699,
"Uranus": 799,
"Neptune": 899,
"Pluto": 999
}

PARENT_IDS = {
"Moon": 399,
"Io": 599,
"Europa": 599,
"Ganymede": 599,
"Callisto": 599,
}

# fallback: if direct body block is missing, fall back to its barycenter
FALLBACK_BARY = {
"Mercury": "1",
"Venus": "2",
"Earth": "3",
"Moon": "3",
"Mars": "4",
"Jupiter": "5",
"Io": "5",
"Europa": "5",
"Ganymede": "5",
"Callisto": "5",
"Saturn": "6",
"Uranus": "7",
"Neptune": "8",
"Pluto": "9",
"Sun":  "10",
}

# mapping NAIF ID -> SPICE name for GM lookup
GM_TARGETS = {
0: "SOLAR SYSTEM BARYCENTER",
1: "MERCURY BARYCENTER",
2: "VENUS BARYCENTER",
3: "EARTH BARYCENTER",
4: "MARS BARYCENTER",
5: "JUPITER BARYCENTER",
6: "SATURN BARYCENTER",
7: "URANUS BARYCENTER",
8: "NEPTUNE BARYCENTER",
9: "PLUTO BARYCENTER",
10: "SUN"
}

ORBIT_CENTERS = {
    "Sun":     0,    # barycenter
    "Mercury": 10,   # Sun
    "Venus":   10,
    "Earth":   10,
    "Moon":    399,  # Earth
    "Mars":    10,
    "Jupiter": 10,
    "Io":      599,  # Jupiter
    "Europa":  599,
    "Ganymede":599,
    "Callisto":599,
    "Saturn":  10,
    "Uranus":  10,
    "Neptune": 10,
    "Pluto":   10,
}


# Load your enriched CSV (must have RAICRS, DEICRS, pmRA, pmDE, size)
star_table = Table.read("gaia_bright_mag_lt6.csv")


@app.get("/api/starfield") 
def starfield(
    date: datetime = Query(
        ..., description="UTC epoch, ISO 8601, e.g. 2025-07-16T00:00:00Z"
    ),
    frame: str = Query(
        "ECLIPJ2000", description="Output frame: J2000 (equatorial) or ECLIPJ2000 (ecliptic)"
    ),
):
    # 1) parse & validate the input date
    try:
        iso_date = date.strftime("%Y-%m-%dT%H:%M:%SZ")
        obstime = Time(iso_date, format="isot", scale="utc")
    except Exception as e:
        raise HTTPException(400, detail=f"Invalid date: {e}")
        print(f"[STARFIELD] date = {date}")


    # 2) build the ICRS coords with proper motion
    sc = SkyCoord(
        ra=star_table["RAICRS"] * u.deg,
        dec=star_table["DEICRS"] * u.deg,
        distance=np.full(len(star_table), 1e3) * u.pc,
        pm_ra_cosdec=star_table["pmRA"] * u.mas / u.yr,
        pm_dec=star_table["pmDE"] * u.mas / u.yr,
        obstime=Time(2016.0, format="jyear"),
        frame=ICRS(),
    )
    sc_epoch = sc.apply_space_motion(new_obstime=obstime)

    # 3) transform into the requested output frame
    frm = frame.upper()
    if frm == "J2000":
        sc_epoch = sc_epoch.transform_to(
            FK5(equinox=Time(2000.0, format="jyear", scale="utc"))
        )
    elif frm == "ECLIPJ2000":
        # True ecliptic of J2000
        sc_epoch = sc_epoch.transform_to(
            BarycentricTrueEcliptic(equinox=Time(2000.0, format="jyear", scale="utc"))
        )
    else:
        raise HTTPException(400, detail=f"Unknown frame: {frame}")

    # 4) extract unit‐sphere vectors
    xyz = np.vstack(
        [
            sc_epoch.cartesian.x.value,
            sc_epoch.cartesian.y.value,
            sc_epoch.cartesian.z.value,
        ]
    ).T
    norms = np.linalg.norm(xyz, axis=1)
    xyz /= norms[:, None]

    # 5) build output list
    stars = [
        {"pos": vec.tolist(), "size": float(row["size"])}
        for row, vec in zip(star_table, xyz)
    ]

    return {"date": iso_date, "frame": frm, "stars": stars}


@app.get("/api/radii")
def live_radii():
    results = {}
    for name in BODY_IDS:
        if name.lower() == "spacecraft":
            sc_radius_km = 0.0347
            results[name] = [sc_radius_km, sc_radius_km, sc_radius_km]
            continue
        try:
            values = sp.bodvrd(name.upper(), "RADII", 3)[1]
            results[name] = list(map(float, values))
        except Exception as e:
            print(f"Failed to get radii for {name}: {e}")
            results[name] = [0, 0, 0]  # or None, as you prefer

    return {"radiiKm": results}


@app.get("/api/ephemeris")
def get_ephemeris(
    date: str = Query(
        ...,
        description="Epoch, ISO 8601 UTC (e.g. 2025-07-16T00:00:00Z)",
        example="2025-07-16T00:00:00Z"
    ),
) -> Dict[str, Any]:
    try:
        t = Time(date, format="isot", scale="utc")
        iso_date = t.datetime.strftime("%Y-%m-%dT%H:%M:%SZ")
    except Exception as e:
        raise HTTPException(401, f"Invalid date: {e}")

    try:
        et = sp.str2et(iso_date)
    except Exception as e:
        raise HTTPException(402, f"SPICE str2et error: {e}")

    all_bodies = {}
    for body, target in BODY_IDS.items():
        with spice_lock:
            # --- Position ---
            try:
                center = PARENT_IDS.get(body, 0)
                state, _ = sp.spkezr(str(target), et, "ECLIPJ2000", "NONE", str(center))
                pos = [float(x) / KM_PER_AU for x in state[:3]]
            except Exception as ex:
                print(f"[ORBIT] Position failed for {body}: {ex}")
                pos = [0.0, 0.0, 0.0]

            # --- Orbit elements (skip Sun) ---
            elements = None
            if body != "Sun":
                try:
                    center = ORBIT_CENTERS.get(body, 10)
                    gm = sp.bodvrd(str(center), "GM", 1)[1][0]
                    r, e, inc, raan, argp = sp.oscelt(state, et, gm)[:5]
                    r = r / KM_PER_AU
                    a = r / (1-e)
                    elements = {
                        "a":     float(a),
                        "e":     float(e),
                        "i":     float(inc),
                        "Omega": float(raan),
                        "omega": float(argp),
                    }
                except Exception as ex:
                    print(f"[ORBIT] Elements failed for {body}: {ex}")
                    elements = None

            # --- Orientation (quaternion) ---
            try:
                frame = f"IAU_{body.upper()}"
                mat = sp.pxform(frame, "ECLIPJ2000", et)
                q = sp.m2q(mat)  # [w, x, y, z]
                quat = [q[1], q[2], q[3], q[0]]  # [x, y, z, w]
            except Exception as ex:
                print(f"[ORBIT] Orientation failed for {body}: {ex}")
                quat = [0, 0, 0, 1]
                
            all_bodies[body] = {
                "elements": elements,
                "pos": pos,
                "quat": quat,
            }

            # -- Spacecraft State ---
            try:
                state, _ = sp.spkezr("-159", et, "ECLIPJ2000", "NONE", "0")
                sc_pos_km = state[:3]
            except Exception as e:
                print(f"[SC-STATE] SPICE error fetching SC state: {e}")
                sc_pos_km = [0.0, 0.0, 0.0]
            sc_pos_au = [c / KM_PER_AU for c in sc_pos_km]

            # --- Spacecraft attitudes ---
            def fetch_quat(sc_id, inst_id, et):
                try:
                    sclk      = sp.sce2c(sc_id, et)
                    tol_ticks = sp.sctiks(sc_id, "15.0")
                    rot, _ = sp.ckgp(inst_id, sclk, tol_ticks, "ECLIPJ2000")
                    q_spice = sp.m2q(rot)
                    return [q_spice[1], q_spice[2], q_spice[3], q_spice[0]]
                except Exception as e:
                    # print(f"[ATT] error for {inst_id}: {e}")
                    return [0,0,0,1]
            scQuat = fetch_quat(-159, -159000, et)
            saQuat  = fetch_quat(-159, -159011, et)


    return {
        "date": iso_date,
        "bodies": all_bodies,
        "spacecraft": {
            "scPos": sc_pos_au,
            "scQuat": scQuat,
            "saQuat": saQuat,
        }
    }

