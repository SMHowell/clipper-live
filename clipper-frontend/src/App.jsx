/** @refresh reset */
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
import { EncounterSelector } from './uiElements.jsx'
import { BodySphere, ClipperModel } from './geometryFunctions.jsx';
import OrbitLine from './geometryFunctions.jsx';
import { getWorldPos } from "./getWorldPos.jsx";

import {
  KM_PER_AU,
  STAR_DIST_SCALE,
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
  const [encounterResetKey, setEncounterResetKey] = useState(0);
  const now = new Date();
  const pad = (n, len = 2) => String(n).padStart(len, "0");
  const [radiiKm, setRadii] = useState({});

  const [year, setYear] = useState(now.getUTCFullYear()); 
  const [month, setMonth] = useState(pad(now.getUTCMonth() + 1));
  const [day, setDay] = useState(pad(now.getUTCDate()));
  const [hour, setHour] = useState(pad(now.getUTCHours()));
  const [minute, setMinute] = useState(pad(now.getUTCMinutes()));
  const [second, setSecond] = useState(pad(now.getUTCSeconds()));
  const [fraction, setFraction] = useState(pad(now.getUTCMilliseconds(), 4));
  const [bodyStates, setBodyStates] = useState({});

  // new state for zoom dropdown
  const [zoomTarget, setZoomTarget] = useState("");
  const controlsRef = useRef();
  // this will hold camera.position − targetPosition in world‐space
  const offsetRef   = useRef(new THREE.Vector3());
  const groupRef = useRef();
  const lastPos = useRef([0, 0]);

  // 1) a quick “are we ready?” test
  const isDataReady =
    bodies.length > 0 &&                 // fetched
    stars.length > 0 &&                  // fetched
    scPos.length === 3 &&                // fetched
    bodies.every(b => Array.isArray(b.pos)); // each body has a pos

  function handleEncounterSelect(enc) {
    if (!enc?.date) return;

    // Parse the CSV time as UTC (append Z if needed)
    const raw = enc.date.trim();
    const dt  = new Date(raw.endsWith("Z") ? raw : raw + "Z");

    // Update our single UTC‐ISO `date` state;
    // the input fields will re‐populate via the [date,useLocalTime] effect below.
    setDate(dt.toISOString());

    // Remount <EncounterSelector> so that its dropdown resets (optional)
    setEncounterResetKey(k => k + 1);
  }

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

    // Remount selector if you still want that behavior
    setEncounterResetKey(k => k + 1);
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

  return (
    <div
      style={{ height: "100vh", width: "100vw", overflow: "hidden" }}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onWheel={onWheel} // ← add this
      // no need for onPointerUp/onPointerLeave when using e.buttons
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          handleDateSubmit();
        }
      }}
      tabIndex={0} // ensure it can receive keyboard events
    >
      {/* ────────────────────────────────────────────────────────── */}
      {/* Date & Time picker above Encounter selector */}
      <div
        style={{
          position: "absolute",
          top: 10,
          left: 10,
          zIndex: 1,
          display: "inline-flex",
          flexDirection: "column",
          gap: "1rem",
          alignItems: "flex-start",
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
            width: "100%",
          }}
        >
          {/* ── Row of steppers & inputs ── */}
          <div
            style={{
              display: "flex",
              flexDirection: "row",
              alignItems: "center",
              gap: "0.5rem",
            }}
          >
            {[
              { unit: "year",   label: "YYYY", value: year,    set: setYear,   width: "4ch" },
              { sep: "-" },
              { unit: "month",  label: "MM",   value: month,   set: setMonth,  width: "2ch" },
              { sep: "-" },
              { unit: "day",    label: "DD",   value: day,     set: setDay,    width: "2ch" },
              { sep: "T" },
              { unit: "hour",   label: "HH",   value: hour,    set: setHour,   width: "2ch" },
              { sep: ":" },
              { unit: "minute", label: "MM",   value: minute,  set: setMinute, width: "2ch" },
              { sep: ":" },
              { unit: "second", label: "SS",   value: second,  set: setSecond, width: "2ch" },
              { sep: "." },
              { unit: "ms",     label: "ssss", value: fraction,set: setFraction,width: "4ch" },
            ].map((cell, i) =>
              cell.sep ? (
                <div key={i} style={{ width: `${cell.sep.length || 1}ch`, textAlign: "center" }}>
                  <span className="text-white">{cell.sep}</span>
                </div>
              ) : (
                <div key={i} style={{ display: "flex", flexDirection: "column", alignItems: "center" }}>
                  {/* steppers */}
                  <div style={{ display: "flex", flexDirection: "column", marginBottom: 2 }}>
                    <button
                      onClick={() => adjustDate(cell.unit, +1)}
                      className="text-white"
                      style={{ padding: 0, lineHeight: 1, fontSize: "0.75rem" }}
                    >+</button>
                    <button
                      onClick={() => adjustDate(cell.unit, -1)}
                      className="text-white"
                      style={{ padding: 0, lineHeight: 1, fontSize: "0.75rem" }}
                    >−</button>
                  </div>
                  {/* input */}
                  <input
                    type="text"
                    value={cell.value}
                    onChange={e => cell.set(e.target.value)}
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
            width: "100%",
            marginTop: 8,
            padding: 8,
            background: "rgba(30, 41, 100, 0.6)",
            borderRadius: "0.5rem",
            color: "white",
          }}
        >
          <EncounterSelector
            key={encounterResetKey}
            onSelect={handleEncounterSelect}
          />
        </div>

        {/* ─────── Zoom selector ─────── */}
        <div
          style={{
            marginTop: 8,
            padding: 8,
            background: "rgba(30, 41, 100, 0.6)",
            borderRadius: "0.5rem",
            color: "white",
            display: "flex",
            flexDirection: "column",
            gap: "0.5rem",
            width: "100%", // matches the date/encounter width
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
        </div>
      </div>
      {/* ────────────────────────────────────────────────────────── */}

      {isDataReady ? (
        <Canvas
          //shadows
          style={{ background: "black" }}
          gl={{ 
            logarithmicDepthBuffer: true, 
            physicallyCorrectLights: true,
            outputEncoding:       THREE.sRGBEncoding,
            toneMapping:          THREE.ACESFilmicToneMapping,
            toneMappingExposure:  1.0,
          }}
          camera={{ position: [10, 0, 5], fov: 50, up: [0, 0, 1], near: 1e-12, far: 1e3 }}
        >
          <group ref={groupRef}>
            <Scene 
              date={date} 
              bodies={bodies} 
              stars={stars} 
              scPos={scPos} 
              orbitLines={orbitLines} 
              radiiKm={radiiKm}
              scQuat={scQuat}
              saQuat={saQuat}
              bodyStates={bodyStates}
            />
          </group>
          <OrbitControls ref={controlsRef} enableRotate={false} enablePan={false} enableZoom />
        </Canvas>
      ) : (
        <div
          style={{
            position: "absolute", top: 0, left: 0,
            width: "100%", height: "100%",
            display: "flex", alignItems: "center", justifyContent: "center",
            color: "white", fontSize: "1.5rem",
            background: "rgba(0,0,0,0.5)"
          }}
        >
          Loading orbital data…
        </div>
      )}
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

function Scene({ date, bodies, stars, scPos, trajectory, orbitLines, radiiKm, scQuat, saQuat, bodyStates }) {
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

  // Constants
  const MAX_POINT_SIZE = 3; // maximum pixel size for the brightest star

  // ─── Build bodies & satellites (no scaling) ───
  const bodyMeshes = useMemo(() =>
    bodies.map(b => {
      return (
        <BodySphere
          key={b.name}
          name={b.name}
          position={getWorldPos(b.name, bodies, scPos)}
          quaternion={bodyStates[b.name].quat}   // <--- the quaternion from backend
          radiiKm={radiiKm?.[b.name]}
          color={colorMap[b.name]}
          levels={[[256,0.005],[128,0.1],[64,1],[32,200]]}
        />
      );
    }),
    [bodies]
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
      size: MAX_POINT_SIZE,
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
      // size in pixels, scale normalized magnitude to MAX_POINT_SIZE
      sizes.push(magnitude * MAX_POINT_SIZE);
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
        <Bloom luminanceThreshold={1} height={300} />
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

      <group position={earthPos}>
        <primitive object={new THREE.AxesHelper(1)} />
      </group>


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
