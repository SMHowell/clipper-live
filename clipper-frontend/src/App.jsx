/** @refresh reset */

import "./App.css";
import React, { useState, useEffect, useRef, useMemo } from "react";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import {
  OrbitControls,
  Html,
  TrackballControls,
  useGLTF,
} from "@react-three/drei";
import { EffectComposer, Bloom } from "@react-three/postprocessing";
import * as THREE from "three";
import Papa from "papaparse";

// App functions 
import { BodySphere, ClipperModel, LatLonOverlay } from './geometryFunctions.jsx';
import OrbitLine from './geometryFunctions.jsx';
import { getWorldPos } from "./getWorldPos.jsx";
import MainScene from './MainScene';
import {InstrumentFOVsAtNearPlane} from "./InstrumentFOVs";

import {
  KM_PER_AU,
  STAR_DIST_SCALE,
  STAR_SIZE_SCALE,
  ENCOUNTER_MAP,
  PLANET_NAMES,
  SAT_PARENT,
  colorMap
} from "./constants.jsx";

export default function App() {
  const [useLocalTime, setUseLocalTime] = useState(true);
  const [date, setDate] = useState(new Date().toISOString());
  const [bodies, setBodies] = useState([]);
  const [stars, setStars] = useState([]);
  const [scPos, setScPos] = useState([0, 0, 0]);
  const [scQuat, setScQuat] = useState([0, 0, 0]);
  const [saQuat, setSaQuat] = useState([0, 0, 0]);
  const [trajectory, setTrajectory] = useState([]);
  const [orbitSamples, setOrbitSamples] = useState({});
  const [orbitElements, setOrbitElements] = useState({});
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const [radiiKm, setRadii] = useState({});
  const [showLatLon, setShowLatLon] = useState(true);
  const [showGeoMaps, setShowGeoMaps] = useState(false);
  const [year, setYear] = useState(now.getUTCFullYear()); 
  const [month, setMonth] = useState(pad(now.getUTCMonth() + 1));
  const [day, setDay] = useState(pad(now.getUTCDate()));
  const [hour, setHour] = useState(pad(now.getUTCHours()));
  const [minute, setMinute] = useState(pad(now.getUTCMinutes()));
  const [second, setSecond] = useState(pad(now.getUTCSeconds()));
  const [fraction, setFraction] = useState(pad(now.getUTCMilliseconds(), 4));
  const [bodyStates, setBodyStates] = useState({}); 
  const [secondaryFOV, setSecondaryFOV] = useState(50);  // default value matching the current camera
  const [primaryFOV, setPrimaryFOV] = useState(50);
  const [showPrimaryFOVs, setShowPrimaryFOVs] = useState(false);

  const [selectedEncounterCode, setSelEnc] = useState("");
  const [encounters, setEncounters] = useState([]);

  // new state for zoom dropdown
  const [zoomTarget, setZoomTarget] = useState("");
  const controlsRef = useRef();
  // this will hold camera.position − targetPosition in world‐space
  const offsetRef   = useRef(new THREE.Vector3());
  const groupRef = useRef();
  const lastPos = useRef([0, 0]);

  const cameraRef       = useRef();
  const rendererRef     = useRef();
  const mainSceneRef    = useRef();
  const overlaySceneRef = useRef(new THREE.Scene()); 

  // 1) a quick “are we ready?” test
  const isDataReady =
    bodies.length > 0 &&                 // fetched
    stars.length > 0 &&                  // fetched
    scPos.length === 3 &&                // fetched
    bodies.every(b => Array.isArray(b.pos)); // each body has a pos

  // unified enc sleect handler
  function handleEncSelect(e) {
    const code = e.target.value;
    setSelEnc(code);

    const enc = encounters.find(c => c.code === code);
    if (!enc?.date) return;

    // 4) Parse always as UTC/Ephemeris Time
    const raw   = enc.date.trim();
    const isoZ  = raw.endsWith("Z") ? raw : raw + "Z";
    const dtUtc = new Date(isoZ);
    if (isNaN(dtUtc.getTime())) {
      console.error(`Invalid encounter date: "${enc.date}"`);
      return;
    }

    // 5) Write back your master date (always Z-ISO)
    const utcIso = dtUtc.toISOString();
    setDate(utcIso);
  }

  // fetch & parse CSV once
  useEffect(() => {
    fetch("/encounters.csv")
      .then(r => r.text())
      .then(text => {
        const rows  = text.split("\n").slice(2).filter(Boolean);
        const items = rows.map(r => {
          const [orbit, code, d] = r.split(",");
          return { orbit: orbit.trim(), code: code.trim(), date: d.trim() };
        });
        setEncounters(items.filter(e => e.code));
      });
  }, []);

  function handleDateSubmit() {
    let dt;
    if (useLocalTime) {
      // interpret fields as *local* wall‐clock
      dt = new Date(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(fraction)
      );
    } else {
      // interpret fields as UTC (Ephemeris Time)
      dt = new Date(Date.UTC(
        Number(year),
        Number(month) - 1,
        Number(day),
        Number(hour),
        Number(minute),
        Number(second),
        Number(fraction)
      ));
      
    }

    // Store *always* as a Z‐terminated ISO for querying your APIs
    setDate(dt.toISOString());
  }

  function adjustDate(unit, delta) {
    // parse the master date (always stored as a Z-terminated ISO)
    const dt = new Date(date);
    
    if (useLocalTime) {
      switch (unit) {
        case 'year':   dt.setFullYear(  dt.getFullYear()   + delta); break;
        case 'month':  dt.setMonth(     dt.getMonth()      + delta); break;
        case 'day':    dt.setDate(      dt.getDate()       + delta); break;
        case 'hour':   dt.setHours(     dt.getHours()      + delta); break;
        case 'minute': dt.setMinutes(   dt.getMinutes()    + delta); break;
        case 'second': dt.setSeconds(   dt.getSeconds()    + delta); break;
        case 'ms':     dt.setMilliseconds(dt.getMilliseconds() + delta); break;
        default: return;
      }
    } else {
      switch (unit) {
        case 'year':   dt.setUTCFullYear(  dt.getUTCFullYear()   + delta); break;
        case 'month':  dt.setUTCMonth(     dt.getUTCMonth()      + delta); break;
        case 'day':    dt.setUTCDate(      dt.getUTCDate()       + delta); break;
        case 'hour':   dt.setUTCHours(     dt.getUTCHours()      + delta); break;
        case 'minute': dt.setUTCMinutes(   dt.getUTCMinutes()    + delta); break;
        case 'second': dt.setUTCSeconds(   dt.getUTCSeconds()    + delta); break;
        case 'ms':     dt.setUTCMilliseconds(dt.getUTCMilliseconds() + delta); break;
        default: return;
      }
    }

    // write it back (always as UTC ISO) and let your existing effect refill the inputs
    setDate(dt.toISOString());
  }

  useEffect(() => {
    fetch('/api/radii')
      .then(r => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(data => setRadii(data.radiiKm || {}))
      .catch(err => {
        console.error("Failed to fetch radii:", err);
        setRadii({});
      });
  }, []);

  // whenever user picks a new date OR toggles local vs ET, refill the 7 inputs:
  useEffect(() => {
    const dt = new Date(date);
    if (useLocalTime) {
      setYear(dt.getFullYear());
      setMonth(pad(dt.getMonth() + 1));
      setDay(pad(dt.getDate()));
      setHour(pad(dt.getHours()));
      setMinute(pad(dt.getMinutes()));
      setSecond(pad(dt.getSeconds()));
      setFraction(pad(dt.getMilliseconds(), 4));
    } else {
      setYear(dt.getUTCFullYear());
      setMonth(pad(dt.getUTCMonth() + 1));
      setDay(pad(dt.getUTCDate()));
      setHour(pad(dt.getUTCHours()));
      setMinute(pad(dt.getUTCMinutes()));
      setSecond(pad(dt.getUTCSeconds()));
      setFraction(pad(dt.getUTCMilliseconds(), 4));
    }
  }, [date, useLocalTime]);

  useEffect(() => {
    // console.log(`Fetching starfield for date=${date}`);
    fetch(`/api/starfield?date=${date}&frame=ECLIPJ2000`)
      .then((r) => r.json())
      .then((d) => {
        setStars(d.stars);
      })
      .catch(console.error);
  }, []);

  // Fetch ephemeris  
  useEffect(() => {
      fetch(`/api/ephemeris?date=${date}`)
        .then(r => {
          if (!r.ok) throw new Error(`HTTP ${r.status}`);
          return r.json();
        })
        .then(d => {
          const bodiesObj = d.bodies || {};

          // Build classic bodies array
          const newBodiesArr = Object.entries(bodiesObj).map(([name, body]) => ({
            name,
            pos: body.pos
          }));

          // Build elements and bodyStates as before
          const newOrbitElements = {};
          const newBodyStates = {};
          for (const [name, body] of Object.entries(bodiesObj)) {
            if (body.elements) newOrbitElements[name] = body.elements;
            newBodyStates[name] = { pos: body.pos, quat: body.quat };
          }

          setOrbitElements(newOrbitElements);
          setBodyStates(newBodyStates);
          setBodies(newBodiesArr); // <--- set the classic array!

          setScPos(d.spacecraft?.scPos ?? [0,0,0]);
          setSaQuat(d.spacecraft?.saQuat ?? [0,0,0,1]);
          setScQuat(d.spacecraft?.scQuat ?? [0,0,0,1]);
        })
        .catch(err => {
          console.error("orbit-elements error:", err);
          setOrbitElements({});
          setBodyStates({});
        });

  }, [date]);

  const orbitLines = useMemo(() =>
    bodies
      .filter(b => b.name !== 'Sun')
      .map(b => (
        <OrbitLine
          key={b.name}
          name={b.name}
          elements={orbitElements[b.name]}  // ← pass the full elements!
          bodies={bodies}
        />
      )),
    [bodies]
  );

  // after zoomTarget changes, move
  useEffect(() => {
      if (!zoomTarget) return;
      const targetPos = getWorldPos(zoomTarget, bodies, scPos);
      if (!targetPos) return;

      const rawKm    = radiiKm[zoomTarget]?.[0] ?? 1;      // ← use batch radii
      const radiusAU = rawKm / KM_PER_AU;
      const off      = new THREE.Vector3(
        10 * radiusAU,
       -10 * radiusAU,
        10 * radiusAU
    );

    const ctrl = controlsRef.current;
    if (!ctrl) return;
    ctrl.target.copy(targetPos);

    // position camera and *save* this offset
    ctrl.object.position.copy(targetPos.clone().add(off));
    offsetRef.current.copy(off);

    ctrl.object.up.set(0, 0, 1);
    ctrl.update();
  }, [zoomTarget]);

  // 1) zoom‐to handler
  function handleZoomChange(e) {
    const name = e.target.value;
    setZoomTarget(name);
  };

  // whenever date changes, move the camera so it keeps the same offset
  useEffect(() => {
    if (!zoomTarget) return;
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    // find the new world‐pos of the same target
    const newTarget = getWorldPos(zoomTarget, bodies, scPos);
    if (!newTarget) return;

    // re‐use the offset we computed earlier
    const off = offsetRef.current;

    // update camera & controls
    ctrl.target.copy(newTarget);
    ctrl.object.position.copy(newTarget.clone().add(off));
    ctrl.update();
  }, [date, zoomTarget, bodies, scPos]);

  // 2) hook the wheel so it dollies in/out about the current target
  function onWheel(e) {
    e.stopPropagation();
    const ctrl = controlsRef.current;
    if (!ctrl) return;

    const scale = ctrl.getZoomScale();
    if (e.deltaY < 0) ctrl.dollyIn(scale);
    else ctrl.dollyOut(scale);

    ctrl.update();

   // save new offset
   offsetRef.current
     .copy(ctrl.object.position)
     .sub(ctrl.target);
  }

  // 3) on pointer down, just remember the start
  function onPointerDown(e) {
    lastPos.current = [e.clientX, e.clientY];
  }

  // 4) on drag, pivot around the current zoomTarget point
  function onPointerMove(e) {
    if (!(e.buttons & 1)) return;

    const [lx, ly] = lastPos.current;
    const dx = e.clientX - lx,
      dy = e.clientY - ly;
    lastPos.current = [e.clientX, e.clientY];

    const ctrl = controlsRef.current;
    if (!ctrl) return;
    const cam = ctrl.object;

    // figure out the lookAt point
    const tb = bodies.find((b) => b.name === zoomTarget);
    const lookAt =
      getWorldPos(zoomTarget, bodies, scPos) || new THREE.Vector3(0, 0, 0);

    // compute offset from lookAt → cam
    const offset = cam.position.clone().sub(lookAt);

    if (Math.abs(dy) > Math.abs(dx)) {
      // — pitch: rotate around camera's local right axis
      cam.lookAt(lookAt);
      const forward = new THREE.Vector3();
      cam.getWorldDirection(forward).normalize();
      const right = new THREE.Vector3()
        .crossVectors(forward, cam.up)
        .normalize();
      const q = new THREE.Quaternion().setFromAxisAngle(right, -dy * 0.005);
      offset.applyQuaternion(q);
      cam.up.applyQuaternion(q);
    } else {
      // — yaw: rotate around world‐Z through lookAt
      const q = new THREE.Quaternion().setFromAxisAngle(
        new THREE.Vector3(0, 0, 1),
        dx * 0.005
      );
      offset.applyQuaternion(q);
      cam.up.applyQuaternion(q);
    }

    // apply new camera pos + orientation
    cam.position.copy(lookAt.clone().add(offset));
    cam.lookAt(lookAt);

    // sync OrbitControls
    ctrl.target.copy(lookAt);
    ctrl.update();

    // save new offset after the drag
    offsetRef.current
     .copy(ctrl.object.position)
     .sub(ctrl.target);
  }
  // 🔁 Update camera FOV reactively
  function CameraFOVUpdater({ fov }) {
    const { camera } = useThree();
    useFrame(() => {
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    });
    return null;
  }
  return (
    <div
      className="view-container" 
      style={{ height: "100vh", width: "100vw", overflow: "hidden" }}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onDragStart={e => e.preventDefault()}
      onWheel={onWheel} // ← add this
      // no need for onPointerUp/onPointerLeave when using e.buttons
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleDateSubmit();
        }
      }}
    >
      {/* ────────────────────────────────────────────────────────── */}
      {/* Date & Time picker above Encounter selector */}
      <CollapsibleContainer>
      <div
        style={{
          position: "absolute",
          top: 65,
          left: 10,
          zIndex: 1,
          display: "inline-flex",
          flexDirection: "column",
          gap: "1rem",
          alignItems: "flex-start",
              fontSize: "0.9rem"
        }}
      >
        <div
          style={{
            display: "flex",
            flexDirection: "column",
            padding: 8,
            background: "rgba(30, 41, 100, 0.6)",
            borderRadius: "0.5rem",
            color: "white",
            width: "95%",
          }}
        >
          {/* ── Row of steppers & inputs ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "0.4rem",
            }}
          >
            {[
              { unit: "year",   label: "YYYY", value: year,    set: setYear,   width: "4ch" },
              { unit: "month",  label: "MM",   value: month,   set: setMonth,  width: "2ch" },
              { unit: "day",    label: "DD",   value: day,     set: setDay,    width: "2ch" },
              { unit: "hour",   label: "HH",   value: hour,    set: setHour,   width: "2ch" },
              { unit: "minute", label: "MM",   value: minute,  set: setMinute, width: "2ch" },
              { unit: "second", label: "SS",   value: second,  set: setSecond, width: "2ch" },
              { unit: "ms",     label: "ssss", value: fraction,set: setFraction,width: "4ch" },
            ].map((cell, i) =>
              cell.sep ? (
                <div key={i} style={{ width: `${cell.sep.length || 1}ch`, textAlign: "center" }}>
                </div>
              ) : (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {/* steppers */}
                  <div style={{ display: "flex", flexDirection: "column", marginBottom: 5}}>
                    <button
                      onClick={() => adjustDate(cell.unit, +1)}
                      className="text-white"
                      style={{ padding: 0, lineHeight: "1.5rem", width: "1.5rem", fontSize: "1rem", backgroundColor: "rgba(71,85,105,0.8)", marginBottom: 5 }}
                    >+</button>
                    <button
                      onClick={() => adjustDate(cell.unit, -1)}
                      className="text-white"
                      style={{ padding: 0, lineHeight: "1.5rem", width: "1.5rem", fontSize: "1rem", backgroundColor: "rgba(71,85,105,0.8)" }}
                    >−</button>
                  </div>
                  {/* input */}
                  <input
                    type="text"
                    value={cell.value}
                    onChange={e => cell.set(e.target.value)}
                    onFocus={e => e.target.select()}      // ← select all on focus
                    onClick={e => e.target.select()}      // ← also select on click/tap
                    onBlur={handleDateSubmit}
                    onKeyPress={e => e.key === "Enter" && handleDateSubmit()}
                    maxLength={cell.label.length}
                    style={{ width: cell.width }}
                    className="bg-slate-600 text-white rounded p-1 text-center"
                  />
                  <span className="text-gray-400 text-xs">{cell.label}</span>
                </div>
              )
            )}
          </div>

          {/* ── Timezone below labels ── */}
          <div className="flex justify-center mt-1">
            <span className="text-gray-400 text-xs">
              {useLocalTime
                ? Intl.DateTimeFormat().resolvedOptions().timeZone
                : "ET/APT"}
            </span>
          </div>

          {/* ── Local-time toggle ── */}
          <div className="mt-2">
            <label className="inline-flex items-center text-white">
              <input
                type="checkbox"
                checked={useLocalTime}
                onChange={e => setUseLocalTime(e.target.checked)}
                className="form-checkbox h-4 w-4"
              />
              <span className="ml-2">use local time</span>
            </label>
          </div>
        </div>

        {/* ─────── Encounter selector ─────── */}
        <div
          style={{
            marginTop: 0,
            padding: 8,
            background: "rgba(30, 41, 100, 0.6)",
            borderRadius: "0.5rem",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            width: "95%", // matches the date/encounter width
            fontSize: "0.9rem"
          }}
        >
          <label htmlFor="encounter-select">Select Encounter</label>
            <select
              id="encounter-select"
              value={selectedEncounterCode}
              onChange={handleEncSelect}
              onInput={handleEncSelect}  // iOS immediate picker movement
              onBlur={handleEncSelect}   // iOS picker dismissal
            >
              <option value="" disabled>-- Select an encounter --</option>
              {encounters.map(enc => (
                <option key={enc.code} value={enc.code}>
                  {enc.code}
                </option>
              ))}
            </select>

            {selectedEncounterCode && (() => {
              const enc = encounters.find(e => e.code === selectedEncounterCode);
              const desc = enc.code === "JOI"
                ? ENCOUNTER_MAP.JOI
                : `${ENCOUNTER_MAP[enc.code.charAt(0)]} targeted flyby`;
              return (
                <p>
                  {enc.code} – {desc} – Orbit {enc.orbit}
                </p>
              );
            })()}
          </div>

        {/* ─────── Zoom selector ─────── */}
        <div
          style={{
            marginTop: 0,
            padding: 8,
            background: "rgba(30, 41, 100, 0.6)",
            borderRadius: "0.5rem",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            width: "95%", // matches the date/encounter width
          }}
        >
          <label htmlFor="zoom-select" className="block mb-1">
            Zoom to
          </label>
          <select
            id="zoom-select"
            className="w-full bg-slate-600 text-white rounded-md p-2"
            value={zoomTarget}
            onChange={handleZoomChange}
          >
            <option key="none" value="" disabled>
              -- pick a body or spacecraft --
            </option>
            <option value="Spacecraft">Spacecraft</option>
            {bodies.map((b) => (
              <option key={b.name} value={b.name}>
                {b.name}
              </option>
            ))}
          </select>
          {/* ── Show lat/lon toggle ── */}
          <label className="inline-flex items-center mt-2 text-white">
            <input
              type="checkbox"
              checked={showLatLon}
              onChange={e => setShowLatLon(e.target.checked)}
              className="form-checkbox h-4 w-4"
            />
            <span className="ml-2">Show lat/lon</span>
          </label>
          {/* ── Show GeoMaps toggle ── */}
          <label className="inline-flex items-center mt-2 text-white">
            <input
              type="checkbox"
              checked={showGeoMaps}
              onChange={e => setShowGeoMaps(e.target.checked)}
              className="form-checkbox h-4 w-4"
            />
            <span className="ml-2">Geologic Maps</span>
          </label>
        </div>

                    {/* ───────  FOV Slider ─────── */}


      <div
        style={{
          marginTop: 0,
          padding: 8,
          background: "rgba(30, 41, 100, 0.6)",
          borderRadius: "0.5rem",
          color: "white",
          display: "flex",
          flexDirection: "column",
          gap: "0.5rem",
          width: "95%",
        }}
      > 
        <label className="inline-flex items-center mt-2 text-white">
    <input
      type="checkbox"
      checked={showPrimaryFOVs}
      onChange={e => setShowPrimaryFOVs(e.target.checked)}
      className="form-checkbox h-4 w-4"
    />
    <span className="ml-2">Show FOV overlays (primary)</span>
  </label>
        
        <label htmlFor="fov-slider" className="block mb-1">
          Primary View FOV: {secondaryFOV}°
        </label>
        <input
          id="primary-fov-slider"
          type="range"
          min={10}
          max={120}
          step={1}
          value={primaryFOV}
          onChange={(e) => setPrimaryFOV(Number(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
        />
        <label htmlFor="fov-slider" className="block mb-1">
          Secondary View FOV: {secondaryFOV}°
        </label>
        <input
          id="fov-slider"
          type="range"
          min={10}
          max={120}
          step={1}
          value={secondaryFOV}
          onChange={(e) => setSecondaryFOV(Number(e.target.value))}
          onPointerDown={(e) => e.stopPropagation()}
          onPointerMove={(e) => e.stopPropagation()}
        />
      </div>
      </div>


        </CollapsibleContainer>
      {/* ────────────────────────────────────────────────────────── */}

      <div className="view view-primary">
        {isDataReady ? (
          <Canvas
            //shadows
            style={{ width: "100%", height: "100%", background: "black" }}
            gl={{ 
              logarithmicDepthBuffer: true, 
              physicallyCorrectLights: true,
              // outputEncoding:       THREE.sRGBEncoding,
              toneMapping:          THREE.ACESFilmicToneMapping,
              toneMappingExposure:  1.0,
            }}
            camera={{ position: [10, 0, 5], fov: primaryFOV, up: [0, 0, 1], near: 1e-14, far: 1e2 }}
            onCreated={({ gl, scene, camera }) => {
                // Store in refs
                rendererRef.current = gl;
                cameraRef.current   = camera;
                mainSceneRef.current = scene;

            }}
          >
            <group ref={groupRef}>
              <CameraFOVUpdater fov={primaryFOV} />
              <MainScene 
                date={date} 
                bodies={bodies} 
                stars={stars} 
                scPos={scPos} 
                orbitLines={orbitLines} 
                radiiKm={radiiKm}
                scQuat={scQuat}
                saQuat={saQuat}
                bodyStates={bodyStates}
                showLatLon={showLatLon}
                showGeoMaps={showGeoMaps}
                overlaySceneRef={overlaySceneRef}
                isPrimaryScene={true}
              />
              {showPrimaryFOVs && <InstrumentFOVsAtNearPlane fov={primaryFOV} />}
              <MultiPassRenderer
                rendererRef={rendererRef}
                cameraRef={cameraRef}
                mainSceneRef={mainSceneRef}
                overlaySceneRef={overlaySceneRef}
              />            
            </group>
            <OrbitControls
              ref={controlsRef}
              enableRotate={false}
              enablePan={false}
              enableZoom
              maxDistance={100}     // don’t go farther than 20 units
            />
            </Canvas>
        ) : (
          <div
            style={{
              position: "absolute", top: 0, left: 0,
              width: "95%", height: "95%",
              display: "flex", alignItems: "center", justifyContent: "center",
              color: "white", fontSize: "1.5rem",
              background: "rgba(0,0,0,0.5)"
            }}
          >
            Loading orbital data…
          </div>
        )}
      </div>
      <SecondaryView
        date={date}
        bodies={bodies}
        stars={stars}
        scPos={scPos}
        trajectory={trajectory}
        orbitLines={orbitLines}
        radiiKm={radiiKm}
        scQuat={scQuat}
        saQuat={saQuat}
        bodyStates={bodyStates}
        showLatLon={showLatLon}
        showGeoMaps={showGeoMaps}
        overlaySceneRef={overlaySceneRef}
        isPrimaryScene={false}
        fov={secondaryFOV}
      />


    </div>
  );
}

function enforceNoRoll(cam) {
  // 1) get the camera’s forward direction
  const forward = new THREE.Vector3();
  cam.getWorldDirection(forward).normalize();

  // 2) world‐Z axis
  const worldZ = new THREE.Vector3(0, 0, 1);

  // 3) compute the camera’s “right” as forward × worldZ
  const right = new THREE.Vector3().crossVectors(forward, worldZ).normalize();

  // 4) recompute up as worldZ × right
  const up = new THREE.Vector3().crossVectors(worldZ, right).normalize();

  cam.up.copy(up);
}

function Scene({ 
    date, 
    bodies, 
    stars, 
    scPos, 
    trajectory, 
    orbitLines, 
    radiiKm, 
    scQuat, 
    saQuat, 
    bodyStates, 
    showLatLon, 
    overlaySceneRef,
    showGeoMaps
  }) {
  // only continue once we have what we need
  const ready =
    bodies.length > 0 &&
    stars.length > 0 &&
    scPos.length === 3;

  if (!ready) return null;

  // scPos is [x_AU, y_AU, z_AU] from your /api/sc-state
  const [sx, sy, sz] = scPos || [0, 0, 0];

  // get camera & viewport info
  const { camera, size } = useThree();
  const fovRad = (camera.fov * Math.PI) / 180;

  const sunPos = getWorldPos("Sun", bodies, scPos);

  // Circle points
  function makeCircleTexture(size = 64) {
    const c = document.createElement("canvas");
    c.width = c.height = size;
    const ctx = c.getContext("2d");
    ctx.fillStyle = "white";
    ctx.beginPath();
    ctx.arc(size / 2, size / 2, size / 2, 0, 2 * Math.PI);
    ctx.fill();
    return new THREE.CanvasTexture(c);
  }

  const circleTex = makeCircleTexture(64);
  const earthPos = getWorldPos("Earth", bodies, scPos);

  // ─── Build bodies & satellites (no scaling) ───
  const bodyMeshes = useMemo(() =>
    bodies.map(b => {
      return (
        <BodySphere
          key={b.name}
          name={b.name}
          position={getWorldPos(b.name, bodies, scPos)}
          quaternion={bodyStates[b.name].quat}
          radiiKm={radiiKm?.[b.name]}
          color={colorMap[b.name]}
          levels={[[256,0.005],[128,0.1],[64,1],[32,200]]}
          showGeoMaps={showGeoMaps}
        />
      );
    }),
    [bodies, showLatLon, showGeoMaps]
  );

  const latLonMeshes= useMemo(() =>
    bodies.map(b => {
      return (
        <LatLonOverlay
          key={b.name}
          position={getWorldPos(b.name, bodies, scPos)}
          quaternion={bodyStates[b.name].quat}
          radiiKm={radiiKm?.[b.name]}
          overlaySceneRef={overlaySceneRef}
        />
      );
    }),
    [bodies, showLatLon]
  );


  // Build a little “glow” point for each body (including satellites)
  const glow = useMemo(() => {
    const positions = [];
    const colors = [];

    bodies.forEach(({ name }) => {
      // use getWorldPos to get absolute [x,y,z] in AU
      const wp = getWorldPos(name, bodies, scPos);
      if (!wp) return;

      positions.push(wp.x, wp.y, wp.z);
      const c = new THREE.Color(colorMap[name] || "white");
      colors.push(c.r, c.g, c.b);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute(
      "position",
      new THREE.Float32BufferAttribute(positions, 3)
    );
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));

    const mat = new THREE.PointsMaterial({
      size: STAR_SIZE_SCALE,
      sizeAttenuation: false, // ← turn off world‐space scaling
      map: circleTex,
      alphaTest: 0.5, // drop the corners
      transparent: true,
      depthTest: true,
      depthWrite: false,
      vertexColors: true, // if you need per‐vertex color
    });

    return new THREE.Points(geo, mat);
  }, [bodies]);

  // build star points as glowing discs with per-star size and proper scaling
  const starPoints = useMemo(() => {
    if (!stars.length) return null;
    const positions = [];
    const colors = [];
    const sizes = [];

    stars.forEach(({ pos, size: magnitude, name }) => {
      // position scaled by STAR_DIST_SCALE
      positions.push(pos[0] * STAR_DIST_SCALE, pos[1] * STAR_DIST_SCALE, pos[2] * STAR_DIST_SCALE);
      // color per star
      const c = new THREE.Color(colorMap[name] || "white");
      colors.push(c.r, c.g, c.b);
      // size in pixels, scale normalized magnitude to STAR_SIZE_SCALE
      sizes.push(magnitude * STAR_SIZE_SCALE);
    });

    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    geo.setAttribute("size", new THREE.Float32BufferAttribute(sizes, 1));

    const mat = new THREE.ShaderMaterial({
      uniforms: {
        map:       { value: circleTex },
        pixelRatio:{ value: window.devicePixelRatio },
      },
      vertexShader: `
        attribute float size;
        uniform float pixelRatio;
        void main() {
          vec4 mvPos = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * (300.0 / -mvPos.z) * pixelRatio;
          gl_Position = projectionMatrix * mvPos;
        }
      `,
      fragmentShader: `
        uniform sampler2D map;
        void main() {
          vec4 tex = texture2D(map, gl_PointCoord);
          if (tex.a < 0.5) discard;
          gl_FragColor = tex;
        }
      `,
      transparent: true,
      depthTest: true,
      depthWrite: false,
      vertexColors: false,
    });

    return new THREE.Points(geo, mat);
  }, [stars, circleTex]);

  return (
    <>

      <EffectComposer>
        <Bloom luminanceThreshold={0.1} height={300} />
      </EffectComposer>

      {/* Lights */}
      <ambientLight intensity={0.1} />

      {/* Trajectory */}
{/*      {trajectory?.length > 0 && (
        <primitive
          object={
            new THREE.Line(
              new THREE.BufferGeometry().setFromPoints(
                trajectory.map((p) => new THREE.Vector3(...p))
              ),
              new THREE.LineBasicMaterial({ color: "cyan" })
            )
          }
        />
      )}*/}

      {/* Orbits (recomputed on date change) */}
      <group>{orbitLines}</group>

      {/* DEBUG 1000 km sphere at origin 
      <mesh>
        <sphereGeometry args={[1000 / KM_PER_AU, 32, 32]} />
        <meshStandardMaterial color="white" wireframe />
      </mesh> */}

      {/* Bodies */}

      {bodyMeshes}

      {showLatLon && latLonMeshes}

{/*      <SubJovianArrow
        europaName="Europa"
        jupiterName="Jupiter"
        radiiMap={radiiKm}
        bodies={bodies}
        scPos={scPos}
        color="lime"
      />*/}

{/*      <group position={earthPos}>
        <primitive object={new THREE.AxesHelper(1)} />
      </group>*/}


      {/*{europaTrack && <primitive object={europaTrack} />}*/}

      {/* FIXED-PIXEL GLOW POINTS */}
      <primitive object={glow} />

      {/* Stars */}
      {starPoints && <primitive object={starPoints} /> }

      {/* Clipper */}
      <group position={scPos}>
        <ClipperModel 
          position={[0,0,0]} 
          date={date} 
          bodies={bodies} 
          scPos={scPos} 
          scQuat={scQuat}
          saQuat={saQuat}
        />
        {/*<axesHelper args={[0.05]} />*/}
      </group>
    </>
  );
}


export function CollapsibleContainer({ children }) {
  const [visible, setVisible] = useState(true);

  return (
    <>
      {/* the little toggle “bot” */}
      <button
        onClick={() => setVisible(v => !v)}
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          width: 40,
          height: 40,
          backgroundColor: "rgba(71,85,105,0.8)", // slate-600 at 80% opacity
          border: "none",
          borderRadius: 4,
          color: "#fff",
          fontSize: "1rem",
          lineHeight: 1,
          cursor: "pointer",
          zIndex: 999,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        {visible ? "<" : ">"}
      </button>

      {/* your menu only renders when visible */}
      {visible && children}
    </>
  );
}

export function SubJovianArrow({
  europaName    = "Europa",
  jupiterName   = "Jupiter",
  radiiMap,                   // e.g. { Europa: [rEq, rPolar], Jupiter: [...] }
  bodies, scPos,             // from your spice hooks
  color        = "magenta",  // arrow color
}) {
  const { scene } = useThree();
  const arrowRef = useRef();

  // 1) Create the ArrowHelper once and add it to the scene
  useEffect(() => {
    const arrow = new THREE.ArrowHelper(
      /* dir    */ new THREE.Vector3(1,0,0),
      /* origin */ new THREE.Vector3(0,0,0),
      /* length */ 1,
      /* color  */ color
    );
    scene.add(arrow);
    arrowRef.current = arrow;
    return () => { scene.remove(arrow); };
  }, [scene, color]);

  // 2) Every frame, recompute the two surface points and update the arrow
  useFrame(() => {
    const arrow = arrowRef.current;
    if (!arrow) return;

    // world centers
    const euroC = getWorldPos(europaName,   bodies, scPos);
    const jupeC = getWorldPos(jupiterName,  bodies, scPos);
    if (!euroC || !jupeC) return;

    const vE = new THREE.Vector3(...euroC);
    const vJ = new THREE.Vector3(...jupeC);

    // direction Europa→Jupiter
    const dirEJ = vJ.clone().sub(vE).normalize();
    // subjovian point on Europa
    const rE = radiiMap[europaName][0] / KM_PER_AU;
    const subjovianPt = vE.clone().add(dirEJ.clone().multiplyScalar(rE));

    // direction Jupiter→Europa
    const dirJE = vE.clone().sub(vJ).normalize();
    // sub-Europa point on Jupiter
    const rJ = radiiMap[jupiterName][0] / KM_PER_AU;
    const subEuropaPt = vJ.clone().add(dirJE.clone().multiplyScalar(rJ));

    // vector between those two surface points
    const arrowVec = subEuropaPt.clone().sub(subjovianPt);
    const L = arrowVec.length();

    // update the ArrowHelper
    arrow.setDirection( arrowVec.clone().normalize() );
    arrow.position.copy( subjovianPt );
    arrow.setLength( L, /* headLength */ 0.1*L, /* headWidth */ 0.05*L );
  });

  return null;    // we did all the work in side-effects
}

function MultiPassRenderer({ rendererRef, cameraRef, mainSceneRef, overlaySceneRef }) {
  useFrame(() => {
    const r = rendererRef.current;
    const c = cameraRef.current;
    const s = mainSceneRef.current;
    const o = overlaySceneRef.current;
    if (!r || !c || !s || !o) return;
    r.autoClear = false;
    r.clear();       // color + depth
    r.render(s, c);  // main scene
    r.render(o, c);  // overlay scene
  }, 1);
  return null;
}



// ————————————
// 1) Camera that sits at (0,0,0) and always looks at `target`
// ————————————
function LockCamera({ target, scPos, scQuat = [0,0,0,1] }) {
  const { camera } = useThree();

  // Pre‐allocate these so we don’t thrash garbage each frame
  const _pos = React.useMemo(
    () => new THREE.Vector3(scPos[0], scPos[1], scPos[2]),
    [scPos]
  );
  const _worldNadir = React.useMemo(() => new THREE.Vector3(), []);
  const _quat = React.useMemo(() => new THREE.Quaternion(), []);

  useFrame(() => {
    camera.position.copy(_pos);

    const [qx, qy, qz, qw] = scQuat;
    const isPointingAvail = !(qx === 0 && qy === 0 && qz === 0 && qw === 1);

    if (isPointingAvail) {
      _quat.set(qx, qy, qz, qw).invert(); // SC-to-world

      // — up vector is the SC's +Z axis in world frame (ram direction) —
      const scZ = new THREE.Vector3(0, 0, 1).applyQuaternion(_quat);
      camera.up.copy(scZ);

      // — boresight is SC's +Y in world frame —
      _worldNadir.set(0, 1, 0).applyQuaternion(_quat);

      camera.lookAt(
        camera.position.x + _worldNadir.x,
        camera.position.y + _worldNadir.y,
        camera.position.z + _worldNadir.z
      );
    } else {
      // fallback look at Europa
      camera.up.set(0, 0, 1);
      camera.lookAt(target.x, target.y, target.z);
    }

    camera.updateMatrixWorld();
  });

  return null;
}

// ————————————
// 2) SecondaryView: identical scene, locked camera
// ————————————
function SecondaryView(props) {
  const { bodies, scPos, scQuat, fov = 50, overlaySceneRef  } = props;
  const target = React.useMemo(() => {
    const europaPos = getWorldPos("Europa", bodies, scPos);
    return europaPos
      ? new THREE.Vector3(europaPos.x, europaPos.y, europaPos.z)
      : new THREE.Vector3(0, 0, 0);
  }, [bodies, scPos]);

  // 🔁 Update camera FOV reactively
  function CameraFOVUpdater({ fov }) {
    const { camera } = useThree();
    useFrame(() => {
      if (camera.fov !== fov) {
        camera.fov = fov;
        camera.updateProjectionMatrix();
      }
    });
    return null;
  }

  return (
    <Canvas
      className="view view-secondary"
      camera={{ fov, up: [0, 0, 1], near: 1e-14, far: 1e2, position: scPos }}
      //shadows
      style={{ background: "black" }}
      gl={{ 
        logarithmicDepthBuffer: true, 
        physicallyCorrectLights: true,
        // outputEncoding:       THREE.sRGBEncoding,
        toneMapping:          THREE.ACESFilmicToneMapping,
        toneMappingExposure:  1.0,
      }}
    >
      <LockCamera target={target} scPos={scPos} scQuat={scQuat} />
      {/* pass exactly the same scene-props you give MainScene in your primary view: */}
      <MainScene {...props} />
      <CameraFOVUpdater fov={fov} />
      <InstrumentFOVsAtNearPlane fov={fov}/>
      {overlaySceneRef.current && <primitive object={overlaySceneRef.current} />}

    </Canvas>
  );
}
