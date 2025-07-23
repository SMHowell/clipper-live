// src/components/LODSphere.js

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { useGLTF } from "@react-three/drei";
import * as THREE from 'three';

// your own hooks / utils / constants:
import { getWorldPos } from './getWorldPos';import {
  KM_PER_AU,
  STAR_DIST_SCALE,
  ENCOUNTER_MAP,
  PLANET_NAMES,
  SAT_PARENT,
  colorMap
} from "./constants";

import {
  LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid
} from "recharts";

/**
 * LODSphere
 *
 * Props:
 *  - name:      string, e.g. "Jupiter"
 *  - date:      ISO date string for fetching orientation
 *  - position:  [x,y,z] in AU
 *  - radiiKm:   [rxKm, ryKm, rzKm]
 *  - color:     THREE.Color-compatible
 *  - levels:    Array<[segments: number, switchDistanceAU: number]>
 */
function LODSphere({
  name,
  date,
  position,
  radiiKm,
  color = 'white',
  levels = [
    [8, 0],
    [16, 10],
    [32, 30],
    [64, 80],
  ],
}) {
  const { camera } = useThree();
  const lodRef = useRef();

  const texture = useMemo(() => {
    if (name === "Europa") {
      return new THREE.TextureLoader().load('/EuropaColor.png');
    } else if (name === "Earth") {
      return new THREE.TextureLoader().load('/Envisat_mosaic_May_-_November_2004.png');
    } else if (name === "Moon") {
      return new THREE.TextureLoader().load('/moon_lro_lroc-wac_mosaic_global_1024.jpg');
    } else {
      return null;
    }
    
  }, [name]);

  // 2) build your LOD object once
  const lod = useMemo(() => {
    const obj = new THREE.LOD();
    levels.forEach(([segments, distAU]) => {
      const geom = new THREE.SphereGeometry(1, segments, segments);
      const matOptions = { color };
      if (name === "Europa" && texture) {
        Object.assign(matOptions, {
          map: texture,
        });
        delete matOptions.color;
      } 
      if (name === "Earth" && texture) {
        Object.assign(matOptions, {
          map: texture,
        });
        delete matOptions.color;
      } 
      if (name === "Moon" && texture) {
        Object.assign(matOptions, {
          map: texture,
        });
        delete matOptions.color;
      }       
      if (name === 'Sun') {
        Object.assign(matOptions, {
          emissive: color,
          emissiveIntensity: 1.5,
          toneMapped: false,
        });
        delete matOptions.color;
      }
      const mesh = new THREE.Mesh(
        geom,
        new THREE.MeshStandardMaterial(matOptions)
      );
      obj.addLevel(mesh, distAU);
    });


    // if it's the Sun, tack a PointLight onto the same object
    if (name === 'Sun') {
      const light = new THREE.PointLight('white', 2, /*distance=*/0, /*decay=*/0);
      light.castShadow = true;
      light.shadow.mapSize.width = 1024;
      light.shadow.mapSize.height = 1024;
      // The light is centered at the origin of `obj`, so it'll follow obj’s transform
      obj.add(light);
    }

    return obj;
  }, [levels, color, name]);

  // 3) scale factors once
  const [scaleX, scaleY, scaleZ] = useMemo(
    () => radiiKm.map((r) => r / KM_PER_AU),
    [radiiKm]
  );

  // 4) on every frame, position + rotate + LOD‐update
  useFrame(() => {
    if (!lodRef.current) return;
    const M = new THREE.Matrix4();
    M.multiply(new THREE.Matrix4().makeScale(scaleX, scaleY, scaleZ));
    M.setPosition(new THREE.Vector3(...position));
    lodRef.current.matrixAutoUpdate = false;
    lodRef.current.matrix.copy(M);
    lodRef.current.update(camera);
  });

  // 5) render
  return <primitive ref={lodRef} object={lod} />;
}

/**
 * BodySphere
 *
 * Top‐level component that reads your spice‐radii hook
 * and world‐position util, then renders LODSphere.
 */
export function BodySphere({ name, position, quaternion, color, levels, radiiKm }) {
  // -90 deg about X axis to go from Z-up (sphere mesh) to Y-up (planetary frame)
  const modelFixQ = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(1,0,0), Math.PI/2);
    return q;
  }, []);

  const bodyQ = useMemo(() => {
    if (!quaternion) return new THREE.Quaternion();
    return new THREE.Quaternion(...quaternion); // [x,y,z,w] from backend
  }, [quaternion]);

  // Compose: modelFixQ * bodyQ (order matters: physical orientation, then fix)
  const finalQ = useMemo(() => {
    return bodyQ.clone().multiply(modelFixQ);
  }, [bodyQ, modelFixQ]);

  if (!Array.isArray(radiiKm) || !position) return null;

  return (
    <group position={position} quaternion={finalQ}>
      <LODSphere
        name={name}
        position={[0,0,0]} // Now at group origin
        radiiKm={radiiKm}
        color={color}
        levels={levels}
      />
    </group>
  );
}

export function ClipperModel({ position, date, bodies, scPos, scQuat, saQuat }) {
  // 1) load two separate GLTFs
  const { scene: scScene }    = useGLTF("/clipper_spacecraft_sc.glb");
  const { scene: saScene }    = useGLTF("/clipper_spacecraft_sa.glb");

  // Inside ClipperModel function body
  const scVec     = getWorldPos("Spacecraft", bodies, scPos);
  const sunPos    = getWorldPos("Sun", bodies, scPos);
  const earthPos  = getWorldPos("Earth", bodies, scPos);
  const europaPos = getWorldPos("Europa", bodies, scPos);

  const vectorDefs = [
    { label: "Europa", target: europaPos, color: "cyan"     },
    { label: "Sun",    target: sunPos,    color: "yellow"   },
    { label: "Earth",  target: earthPos,  color: "green" },
  ];

  // 3) build spacecraft → world quaternion
  const scWorldQ = useMemo(() => {
    if (scQuat?.length === 4) {
      const [x,y,z,w] = scQuat;
      return new THREE.Quaternion(x,y,z,w).invert();
    }
    return new THREE.Quaternion();
  }, [scQuat]);

  // 4) build array → world quaternion
  const saWorldQ = useMemo(() => {
    if (saQuat?.length === 4) {
      const [x,y,z,w] = saQuat;
      return new THREE.Quaternion(x,y,z,w).invert();
    }
    return new THREE.Quaternion();
  }, [saQuat]);

  // 5) relative hinge quaternion in SC‐local
  const saRelQ = useMemo(() => {
    return scWorldQ.clone().invert().multiply(saWorldQ).normalize();
  }, [scWorldQ, saWorldQ]);

  // 6) hinge offset in meters → AU (along SC +Y axis)
  const HINGE_OFFSET_M = -1.7388; 

  // 7) overall scale
  const SCALE = 35.47 / 1e3 / KM_PER_AU;

  return (
    <group position={position} scale={[SCALE, SCALE, SCALE]}>
      {/* ── BUS ── */}
      <group quaternion={scWorldQ}>
        <primitive object={scScene.clone()} />
        {/*<primitive object={new THREE.AxesHelper(35.47)} />*/}
      </group>

      {/* ── ARRAYS ── */}
      <group quaternion={scWorldQ}>
        {/* translate *along the rotated SC axes* */}
        <group position={[0, 0, -HINGE_OFFSET_M]}>
          {/* then apply only the hinge rotation */}
          <group quaternion={saRelQ.toArray()}>
            <primitive object={saScene.clone()} />
            {/*<primitive object={new THREE.AxesHelper(35.47)} />*/}
          </group>
        </group>
      </group>

    {vectorDefs.map(({label, target, color}) => {
      if (!scVec || !target) return null;
      const dir = target.clone().sub(scVec).normalize();
      const length = 5;
      return (
        <primitive
          key={label}
          object={new THREE.ArrowHelper(dir, scVec, length, color, 0.2 * length, 0.07 * length)}
        />
      );
    })}

    </group>
  );
}

const OrbitLine = React.memo(
  function OrbitLine({ name, elements, bodies }) {
    // 2) Memoize geometry + material build
    const [geometry, material] = useMemo(() => {
      if (!elements) return [null, null];

      const { a, e, i: inc, Omega, omega } = elements;
      const N = 1024;
      const pts = [];

      // Sample the orbit in its perifocal plane
      for (let k = 0; k <= N; k++) {
        const nu = (k / N) * 2 * Math.PI;
        const r  = (a * (1 - e * e)) / (1 + e * Math.cos(nu));
        const p  = new THREE.Vector3(r * Math.cos(nu), r * Math.sin(nu), 0)
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), omega)
          .applyAxisAngle(new THREE.Vector3(1, 0, 0), inc)
          .applyAxisAngle(new THREE.Vector3(0, 0, 1), Omega);
        pts.push(p);
      }

      // Compute “fade‐tail” starting index based on current body position
      let i0 = 0, minD2 = Infinity;
      const me = bodies.find(b => b.name === name);
      if (me?.pos) {
        const bp = new THREE.Vector3(...me.pos);
        pts.forEach((pt, idx) => {
          const d2 = pt.distanceToSquared(bp);
          if (d2 < minD2) {
            minD2 = d2;
            i0 = idx - Math.ceil((0.005 * N) / 2);
            if (i0 < 0) i0 += N + 1;
          }
        });
      }

      // Build per-vertex alpha array
      const fadeLen = N / 2;
      const alphas = new Float32Array(N + 1);
      for (let k = 0; k <= N; k++) {
        const rel = ((i0 - k) + (N + 1)) % (N + 1);
        alphas[k] = rel <= fadeLen
          ? 1
          : rel <= fadeLen * 2
          ? 1 - (rel - fadeLen) / fadeLen
          : 0;
      }

      // Create geometry + upload alpha
      const geo = new THREE.BufferGeometry().setFromPoints(pts);
      geo.setAttribute('alpha', new THREE.Float32BufferAttribute(alphas, 1));

      // Create shader material that uses the alpha attribute + body color
      const mat = new THREE.ShaderMaterial({
        uniforms: {
          uColor: { value: new THREE.Color(colorMap[name] || 'white') }
        },
        vertexShader: `
          attribute float alpha;
          varying   float vAlpha;
          void main(){
            vAlpha = alpha;
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
          }`,
        fragmentShader: `
          uniform vec3 uColor;
          varying float vAlpha;
          void main(){
            gl_FragColor = vec4(uColor, vAlpha);
          }`,
        transparent: true,
        depthWrite: false
      });

      return [geo, mat];
    }, [elements, bodies, name]);

    // 3) Bail out if we couldn’t build
    if (!geometry || !material) return null;

    // 4) Build the THREE.Line and wrap under a parent if this is a moon
    const line = new THREE.Line(geometry, material);
    const parentName = SAT_PARENT[name];
    if (parentName) {
      const parent = bodies.find(b => b.name === parentName);
      if (!parent?.pos) return null;
      return (
        <group position={parent.pos}>
          <primitive object={line} />
        </group>
      );
    }

    // 5) Otherwise draw it around the central body
    return <primitive object={line} />;
  },
  // Only re-render if these props actually change
  (prev, next) =>
    prev.name === next.name &&
    prev.date === next.date &&
    prev.bodies === next.bodies
);

export default OrbitLine;

/**
 * Fetches spacecraft positions from –duration to +duration about date.
 * step in seconds.
 * Returns Array<[x,y,z]> in AU.
 */
export function useOrbitTrack(date, duration = 24*60*60, step = 60*60) {
  const [track, setTrack] = useState(null);

  useEffect(() => {
    if (!date) {
      setTrack(null);
      return;
    }
    const qs = new URLSearchParams({
      date,
      duration: duration.toString(),
      step:     step.toString()
    }).toString();

    fetch(`/api/orbit-track?${qs}`)
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then(({ trajectory }) => setTrack(trajectory))
      .catch((err) => {
        console.error("orbit-track fetch error:", err);
        setTrack(null);
      });
  }, [date, duration, step]);

  return track;
}

