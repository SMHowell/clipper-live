import React, { useState, useEffect } from "react";

const ENCOUNTER_MAP = {
  G: "Ganymede",
  E: "Europa",
  C: "Callisto",
  JOI: "Jupiter Orbit Insertion",
};

export function EncounterSelector({ onSelect }) {

  const handleChange = (e) => {
    const code = e.target.value;
    setSelected(code);
    const enc = encounters.find((e) => e.code === code);
    if (onSelect) onSelect(enc);
  };

  const selectedEncounter = encounters.find((e) => e.code === selected);

  const getDescription = (code) => {
    if (code === "JOI") return ENCOUNTER_MAP.JOI;
    const prefix = code.charAt(0);
    return `${ENCOUNTER_MAP[prefix]} targeted flyby`;
  };

  return (
    <div className="bg-slate-700 text-white rounded-lg p-4">
      <label htmlFor="encounter-select" className="block mb-2">
        Select Encounter
      </label>

      <select
        id="encounter-select"
        className="w-full bg-slate-600 text-white rounded-md p-2 mb-4"
        value={selected}
        onChange={handleChange}
        onBlur={handleChange}
      >
        <option value="" disabled>
          -- Select an encounter --
        </option>
        {encounters.map((enc) => (
          <option key={enc.code} value={enc.code}>
            {enc.code}
          </option>
        ))}
      </select>

      {selectedEncounter && (
        <p>
          {selectedEncounter.code} - {getDescription(selectedEncounter.code)} -
          Orbit {selectedEncounter.orbit}
        </p>
      )}
    </div>
  );
}
