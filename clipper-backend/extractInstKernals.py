#!/usr/bin/env python3
import re
import json
from pathlib import Path

# Directory containing your .ti files
SPICE_DIR = "./SPICE/Clipper/"

# Regex patterns for FOV parameters
frame_re       = re.compile(r"INS-(\d+)_FOV_FRAME\s*=\s*'([^']+)'")
shape_re       = re.compile(r"INS-(\d+)_FOV_SHAPE\s*=\s*'([^']+)'")
boresight_re   = re.compile(r"INS-(\d+)_BORESIGHT\s*=\s*\(\s*([^\)]+)\)")
ref_vec_re     = re.compile(r"INS-(\d+)_FOV_REF_VECTOR\s*=\s*\(\s*([^\)]+)\)")
ref_angle_re   = re.compile(r"INS-(\d+)_FOV_REF_ANGLE\s*=\s*\(\s*([^\)]+)\)")
cross_angle_re = re.compile(r"INS-(\d+)_FOV_CROSS_ANGLE\s*=\s*\(\s*([^\)]+)\)")
angle_units_re= re.compile(r"INS-(\d+)_FOV_ANGLE_UNITS\s*=\s*'([^']+)'")
# Regex for initial table entries: NAME and NAIF ID
table_re       = re.compile(r"^\s*([A-Z0-9_+\-]+)\s+(-?\d+)" )

lookup: dict[str, dict] = {}

for ti_path in Path(SPICE_DIR).glob("*.ti"):
    print(f"[DEBUG] Parsing file: {ti_path.name}")
    lines = ti_path.read_text().splitlines()

    # ——— 1) parse initial table for KOZ IDs ——————————————————————————
    koz_ids: set[str] = set()
    in_table = False
    for line in lines:
        # detect start of table by first matching NAME + ID header
        if not in_table and line.strip().startswith("EUROPAM_"):
            in_table = True
        if in_table:
            m = table_re.match(line)
            if not m or line.strip() == "":
                break  # end of table on blank or non-matching line
            name, id_str = m.groups()
            # any name containing '_KOZ' is a keep-out zone
            if '_KOZ' in name:
                koz_ids.add(id_str.lstrip('-'))
    print(f"[DEBUG] KOZ IDs from table in {ti_path.name}: {sorted(koz_ids)}")

    text = "\n".join(lines)
    local: dict[str, dict] = {}

    # ——— 2) extract all FOV params into local dict ——————————————————
    for inst_id, frame in frame_re.findall(text):
        local.setdefault(inst_id, {})["frame"] = frame
    for inst_id, shape in shape_re.findall(text):
        local.setdefault(inst_id, {})["shape"] = shape
    for inst_id, raw in boresight_re.findall(text):
        nums = [float(tok) for tok in re.split(r"[,\s]+", raw.strip()) if tok]
        local.setdefault(inst_id, {})["boresight"] = nums
    for inst_id, raw in ref_vec_re.findall(text):
        nums = [float(tok) for tok in re.split(r"[,\s]+", raw.strip()) if tok]
        local.setdefault(inst_id, {})["ref_vector"] = nums
    for inst_id, raw in ref_angle_re.findall(text):
        local.setdefault(inst_id, {})["ref_angle"] = float(raw)
    for inst_id, raw in cross_angle_re.findall(text):
        local.setdefault(inst_id, {})["cross_angle"] = float(raw)
    for inst_id, units in angle_units_re.findall(text):
        local.setdefault(inst_id, {})["angle_units"] = units

    # ——— 3) merge into global lookup, skipping KOZ IDs ————————————
    for inst_id, params in local.items():
        if inst_id in koz_ids:
            print(f"[DEBUG] Skipping KOZ instrument {inst_id}")
            continue
        if inst_id in lookup:
            lookup[inst_id].update(params)
        else:
            lookup[inst_id] = params

# Done
print(f"[DEBUG] Total instruments collected (excluding KOZ): {len(lookup)}")

# Write to JSON
out_path = Path("../clipper-frontend/public/spice_fov_lookup.json")
out_path.write_text(json.dumps(lookup, indent=2))
print(f"[DEBUG] Wrote lookup to {out_path.resolve()}")
