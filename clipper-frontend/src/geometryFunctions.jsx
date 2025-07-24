// src/components/LODSphere.js

import React, { useRef, useEffect, useMemo, useState } from 'react';
import { useFrame, useThree, createPortal } from '@react-three/fiber';
import { useGLTF, Text } from "@react-three/drei";
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
function useTextureWithFallback(name, showGeoMaps) {
  const [texture, setTexture] = useState(null)

  useEffect(() => {
    let cancelled = false
    const loader = new THREE.TextureLoader()

    const primary   = showGeoMaps ? 'GeoMaps'   : 'PhotoMaps'
    const secondary = showGeoMaps ? 'PhotoMaps' : 'GeoMaps'

    // Build the sequence of [folder, extension] tries
    const attempts = [
      [primary,   '.png'],
      [primary,   '.jpg'],
      [secondary, '.png'],
      [secondary, '.jpg'],
    ]

    // Recursively try each [folder, ext]
    const tryNext = idx => {
      if (cancelled) return
      if (idx >= attempts.length) {
        setTexture(null)
        return
      }

      const [folder, ext] = attempts[idx]
      const url = `/${folder}/${name}${ext}`

      loader.load(
        url,
        tex => {
         // ensure the PNG/JPG comes in as sRGB, so colors don’t get washed out
         tex.encoding = THREE.sRGBEncoding;
         if (!cancelled) setTexture(tex);
        },
        undefined,
        () => tryNext(idx + 1)
      )
    }

    tryNext(0)

    return () => { cancelled = true }
  }, [name, showGeoMaps])
 
  return texture
}


export function LODSphere({
  name,
  date,          // if you need this elsewhere
  position,
  radiiKm,
  color = 'white',
  levels = [
    [8, 0],
    [16, 10],
    [32, 30],
    [64, 80],
  ],
  showGeoMaps,
}) {
  const { camera } = useThree()
  const lodRef = useRef()

  // 1) Try loading name.png then name.jpg, else null
  const texture = useTextureWithFallback(name, showGeoMaps)

  // 2) Build LOD
  const lod = useMemo(() => {
    const obj = new THREE.LOD()
    const isSun = name === 'Sun'

    levels.forEach(([segments, distAU]) => {
      const geom = new THREE.SphereGeometry(1, segments, segments)

      // Base material opts
      const matOpts = {}

      if (texture) {
        // apply texture for non-sun bodies
        matOpts.map = texture
        matOpts.metalness=0
        matOpts.roughness=1,      // maximum roughness → zero specular
        matOpts.toneMapped=true // let the renderer tone-map it normally
        matOpts.emissive = 'white';
        matOpts.emissiveMap = texture; 
        matOpts.emissiveIntensity = 0.05
      }

      if (isSun) {
        // special emissive Sun
        matOpts.emissive = 'white';
        matOpts.emissiveMap = texture; 
        matOpts.emissiveIntensity = 1
        matOpts.toneMapped = false
      }

      const mat = new THREE.MeshStandardMaterial(matOpts)
      const mesh = new THREE.Mesh(geom, mat)
      obj.addLevel(mesh, distAU)
    })

    // tack on point-light to the Sun LOD
    if (name === 'Sun') {
      const light = new THREE.PointLight('white', 2, 0, 0)
      light.castShadow = true
      light.shadow.mapSize.set(1024, 1024)
      obj.add(light)
    }

    return obj
  }, [levels, color, name, texture])

  // 3) Compute scale once
  const [scaleX, scaleY, scaleZ] = useMemo(
    () => radiiKm.map(r => r / KM_PER_AU),
    [radiiKm]
  )

  // 4) On every frame: position, scale, and update LOD
  useFrame(() => {
    const lodObj = lodRef.current
    if (!lodObj) return
    const M = new THREE.Matrix4()
      .makeScale(scaleX, scaleY, scaleZ)
      .setPosition(new THREE.Vector3(...position))
    lodObj.matrixAutoUpdate = false
    lodObj.matrix.copy(M)
    lodObj.update(camera)
  })

  // 5) Render
  return <primitive ref={lodRef} object={lod} />
}

function usePlanetTransform(quaternion) {
  const modelFixQ = useMemo(() => {
    const q = new THREE.Quaternion();
    q.setFromAxisAngle(new THREE.Vector3(1, 0, 0), Math.PI / 2);
    return q;
  }, []);

  const bodyQ = useMemo(() => {
    if (!quaternion) return new THREE.Quaternion();
    return new THREE.Quaternion(...quaternion); // [x,y,z,w]
  }, [quaternion]);

  return useMemo(() => bodyQ.clone().multiply(modelFixQ), [bodyQ, modelFixQ]);
}

/**
 * BodySphere
 *
 * Top‐level component that reads your spice‐radii hook
 * and world‐position util, then renders LODSphere.
 */
export function BodySphere({ name, position, quaternion, color, levels, radiiKm, showGeoMaps }) {
  const finalQ = usePlanetTransform(quaternion);
  if (!Array.isArray(radiiKm) || !position) return null;

  return (
    <group position={position} quaternion={finalQ}>
      <LODSphere
        name={name}
        position={[0, 0, 0]} // center
        radiiKm={radiiKm}
        color={color}
        levels={levels}
        showGeoMaps={showGeoMaps}
      />
    </group>
  );
}

/**
 * Renders your LatLonGrid into the separate overlay scene,
 * guaranteed to draw *after* the main scene.
 */
export function LatLonOverlay({
  overlaySceneRef,
  position,
  quaternion,
  radiiKm,
  spacing = 15
}) {
  const finalQ = usePlanetTransform(quaternion);
  if (!position || !Array.isArray(radiiKm)) return null;

 // createPortal takes (children, targetScene)
 return createPortal(
   <group position={position} quaternion={finalQ}>
     <LatLonGrid
       radiiAU={radiiKm.map(r => 1.002 * r / KM_PER_AU)}
       spacing={spacing}
       lineColor="gray"
       labelColor="white"
       labelSize={0.02}
     />
   </group>,
   overlaySceneRef.current
 );
}
export function ClipperModel({ position, date, bodies, scPos, scQuat, saQuat }) {
  // 1) load two separate GLTFs
  const { scene: scScene }    = useGLTF("/clipper_spacecraft_sc.glb");
  const { scene: saScene }    = useGLTF("/clipper_spacecraft_sa.glb");

  // Inside ClipperModel function body
  const scVec     = getWorldPos("Spacecraft", bodies, scPos);
  const sunVec    = getWorldPos("Sun", bodies, scPos);
  const earthVec  = getWorldPos("Earth", bodies, scPos);
  const europaVec = getWorldPos("Europa", bodies, scPos);

  const vectorDefs = [
    { label: "Europa", target: europaVec, color: "cyan"     },
    { label: "Sun",    target: sunVec,    color: "yellow"   },
    { label: "Earth",  target: earthVec,  color: "green" },
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
        {vectorDefs.map(({label, target, color}) => {
          if (!scVec || !target) return null;
          const dir = target.clone().sub(scVec).normalize();
          const length = 5;
          return (
            <primitive
              key={label}
              object={new THREE.ArrowHelper(dir, new THREE.Vector3( 0, 0, 0 ), length, color, 0.2 * length, 0.07 * length)}
            />
          );
        })}
      {/* ── BUS ── */}
      <group quaternion={scWorldQ}>
        <primitive object={scScene.clone()} />
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
 
export function LatLonGrid({
  // now pass an array [rx,ry,rz] in AU—no `date` prop here!
  radiiAU    = [1, 1, 1],
  spacing    = 15,
  segments   = 128,
  lineColor  = 'lime',
  labelColor = 'lime',
  labelSize  = 0.02,       // base size, multiplied by the largest axis
}) {
  // unpack your three semi-axes
  const [rx, ry, rz] = Array.isArray(radiiAU)
    ? radiiAU
    : [radiiAU, radiiAU, radiiAU]

  // ── build the grid once ──
  const grid = useMemo(() => {
    const g   = new THREE.Group()
    const mat = new THREE.LineBasicMaterial({ color: lineColor })

    // Parallels (constant latitude φ)
    for (let lat = -90; lat <= 90; lat += spacing) {
      const φ  = THREE.MathUtils.degToRad(lat)
      const y  = Math.sin(φ) * ry
      const px = Math.cos(φ) * rx
      const pz = Math.cos(φ) * rz

      const pts = []
      for (let i = 0; i <= segments; i++) {
        const ang = (i / segments) * Math.PI * 2
        pts.push(new THREE.Vector3(
          Math.cos(ang) * px,
          y,
          Math.sin(ang) * pz
        ))
      }
      const geom = new THREE.BufferGeometry().setFromPoints(pts)
      g.add(new THREE.LineLoop(geom, mat))
    }

    // Meridians (constant longitude θ)
    for (let lon = 0; lon < 360; lon += spacing) {
      const θ      = THREE.MathUtils.degToRad(lon)
      const points = []
      for (let lat = -90; lat <= 90; lat += 1) {
        const φ = THREE.MathUtils.degToRad(lat)
        points.push(new THREE.Vector3(
          rx * Math.cos(φ) * Math.cos(θ),
          ry * Math.sin(φ),
          rz * Math.cos(φ) * Math.sin(θ)
        ))
      }
      const geom = new THREE.BufferGeometry().setFromPoints(points)
      g.add(new THREE.Line(geom, mat))
    }

    return g
  }, [rx, ry, rz, spacing, segments, lineColor])


  return (
    <group>
      <primitive object={grid} />

      {/* ── Longitude labels ── */}
      {Array.from({ length: 360 / spacing }, (_, i) => {
        const lon = i * spacing
        const θ   = THREE.MathUtils.degToRad(lon)
        const x   = 1.01 * rx * Math.cos(θ)
        const z   = 1.01 * rz * Math.sin(θ)

        // ellipsoid normal → quaternion
        const dir  = new THREE.Vector3(x/(rx*rx), 0, z/(rz*rz)).normalize()
        const quat = new THREE.Quaternion()
          .setFromUnitVectors(new THREE.Vector3(0,0,1), dir)

        // label text, no E/W at 0° or 180°
        let labelLon
        if (lon === 0 || lon === 180) {
          labelLon = `${lon}°`
        } else {
          const disp = lon < 180 ? lon : 360 - lon
          const hemi = lon > 180 ? 'E' : 'W'
          labelLon    = `${disp}°${hemi}`
        }

        return (
          <Text
            key={labelLon}
            position={[x, 0, z]}
            quaternion={[quat.x, quat.y, quat.z, quat.w]}
            fontSize={labelSize * Math.max(rx, rz)}
            color={labelColor}
            anchorX="center"
            anchorY="middle"
          >
            {labelLon}
          </Text>
        )
      })}

      {/* ── Latitude labels ── */}
     {Array.from({ length: 180 / spacing + 1 }, (_, j) => {
        const lat = -90 + j * spacing
        const φ   = THREE.MathUtils.degToRad(lat)
        const x   = 1.01 * rx * Math.cos(φ)
        const y   = 1.01 * Math.sin(φ) * ry

        let labelLat;
        if (lat === 0) {
          labelLat = `0°`;
        } else {
          const displayLat = Math.abs(lat);
          const hemiLat    = lat >= 0 ? 'N' : 'S';
          labelLat = `${displayLat}°${hemiLat}`;
        }

        return (
          <Text
            key={`lat-${lat}`}
            position={[x, y, 0]}
            rotation={[0,Math.PI/2, 0]}
            fontSize={labelSize * rx}
            color={labelColor}
          >
            {labelLat}
          </Text>
        )
      })}
      </group>
  )
}