from astroquery.gaia import Gaia
from astropy.table   import Table
import numpy as np

# 1) Build your ADQL query, aliasing to your old column names if you like:
adql = """
SELECT
  source_id,
  ra            AS RAICRS,
  dec           AS DEICRS,
  phot_g_mean_mag AS Vmag,
  pmra          AS pmRA,
  pmdec         AS pmDE
FROM gaiadr3.gaia_source
WHERE phot_g_mean_mag < 6
"""

# 2) Launch the job (async recommended for >10³ rows)
job = Gaia.launch_job_async(adql)

# 3) Grab results as an Astropy Table
star_table = job.get_results()

# build a combined mask of “bad” rows
mask = np.zeros(len(star_table), dtype=bool)

for col in ['RAICRS','DEICRS','Vmag','pmRA','pmDE']:
    arr = star_table[col]
    # handle both masked arrays and plain numpy arrays
    if hasattr(arr, 'mask'):
        mask |= arr.mask
    else:
        mask |= np.isnan(arr)

# keep only the un-masked rows
clean_table = star_table[~mask]

print(f"Dropped {mask.sum()} rows; {len(clean_table)} remain.")

# 4) (Optional) write out for caching
# star_table.write("../clipper-frontend/public/gaia_bright_mag_lt6.csv", format="csv", overwrite=True)

mags = clean_table['Vmag'].astype(float)
min_mag, max_mag = mags.min(), mags.max()

# avoid zero‐division
mag_range = max_mag - min_mag if max_mag != min_mag else 1.0

size_min, size_max = 1.0, 3.0
sizes = size_min + (max_mag - mags) / mag_range * (size_max - size_min)

clean_table['size'] = sizes

# 5) Write out the enriched table (with size) for your front-end to consume
clean_table.write(
    ".gaia_bright_mag_lt6.csv",
    format="csv",
    overwrite=True
)

print(f"Added 'size' column; sample values:")