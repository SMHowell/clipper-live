import React, { useMemo, useEffect, useRef } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { EffectComposer, Bloom } from '@react-three/postprocessing';
import * as THREE from 'three';

import {
  BodySphere,
  ClipperModel,
  LatLonOverlay
} from './geometryFunctions.jsx';
import OrbitLine from './geometryFunctions.jsx';
import { getWorldPos } from './getWorldPos.jsx';
import {
  KM_PER_AU,
  STAR_DIST_SCALE,
  colorMap
} from './constants.jsx';

export default function MainScene({ 
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
    showGeoMaps,
    isPrimaryScene
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
        {isPrimaryScene && (
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
        )}
    </>
  );
}


