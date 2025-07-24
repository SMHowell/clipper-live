// src/constants.jsx

// ——— Distance & size scales ———
export const KM_PER_AU      = 149_597_870.7;  // kilometers per astronomical unit
export const STAR_DIST_SCALE = 1000;          // scale factor for star distances
export const STAR_SIZE_SCALE = 1;            // scale factor for star sizes

// ——— Encounter code → full name map ———
export const ENCOUNTER_MAP = {
  G:   "Ganymede",
  E:   "Europa",
  C:   "Callisto",
  JOI: "Jupiter Orbit Insertion",
};

// ——— Bodies for SPICE lookups ———
export const PLANET_NAMES = [
  "Sun",
  "Mercury",
  "Venus",
  "Earth",
  "Mars",
  "Jupiter",
  "Saturn",
  "Uranus",
  "Neptune",
  "Moon",
  "Io",
  "Europa",
  "Ganymede",
  "Callisto",
  "Pluto",
];

// ——— Parent relationships (for getWorldPos, etc.) ———
export const SAT_PARENT = {
  Moon:     "Earth",
  Io:       "Jupiter",
  Europa:   "Jupiter",
  Ganymede: "Jupiter",
  Callisto: "Jupiter",
};

// ——— Visualization colors ———
export const colorMap = {
  Sun:     "yellow",
  Mercury: "gray",
  Venus:   "orange",
  Earth:   "blue",
  Mars:    "red",
  Jupiter: "orange",
  Saturn:  "tan",
  Uranus:  "lightblue",
  Neptune: "darkblue",
  Pluto:   "purple",

  Moon:     "lightgray",
  Io:       "#ffcc00",
  Europa:   "#00ffff",
  Ganymede: "#cccccc",
  Callisto: "#eeeeee",
};
