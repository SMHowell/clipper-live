// src/uiElements.jsx

import React, { useState, useEffect } from 'react';
import Papa from 'papaparse';
import { ENCOUNTER_MAP } from './constants';

/**
 * <EncounterSelector />
 * 
 * Props:
 * - onSelect: (encounter: { code, orbit, dateStr, date }) => void
 *
 * Loads encounters from `/encounters.csv`, parses them, and renders a dropdown.
 */
export function EncounterSelector({ onSelect }) {
  const [encounters, setEncounters] = useState([]);

  useEffect(() => {
    Papa.parse('/encounters.csv', {
      download: true,
      header: true,
      complete: (results) => {
        const data = results.data
          .filter(row => row.Name)
          .map(row => ({
            code: row.Name,
            orbit: row.Orbit,
            dateStr: row.Date,
            date: new Date(row.Date)
          }));
        setEncounters(data);
      },
      error: (err) => console.error('Error loading encounters.csv:', err),
    });
  }, []);

  const handleChange = e => {
    const selected = encounters.find(enc => enc.code === e.target.value);
    if (selected && onSelect) onSelect(selected);
  };

  return (
    <select onChange={handleChange} defaultValue="">
      <option value="" disabled>
        Select an encounter
      </option>
      {encounters.map(({
