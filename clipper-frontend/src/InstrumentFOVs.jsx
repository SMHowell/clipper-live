import * as THREE from "three";
import React, { useMemo, useRef, useEffect } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import fovData from "./spice_fov_lookup.json";

export const INSTRUMENT_FOVS = [
  {
    instrument: "EIS_NAC",
    fov_x: 2.35,
    fov_z: 1.17,
    offset_x: 0.0,
    offset_z: 0.0,
    err_x: 0.0,
    err_z: 0.0,
    rot_y: 0.0,
    color: "lightblue",
  },
  {
    instrument: "EIS_WAC",
    fov_x: 48.0,
    fov_z: 24.0,
    offset_x: 0.0,
    offset_z: 0.0,
    err_x: 0.2,
    err_z: -0.2,
    rot_y: 0.0,
    color: "lightblue",
  },
  {
    instrument: "MISE",
    fov_x: 4.297,
    fov_z: 0.007,
    offset_x: 0.0,
    offset_z: 0.0,
    err_x: 0.0,
    err_z: 0.0,
    rot_y: 0.0,
    color: "orange",
  },
  {
    instrument: "UVS_SP_1",  // split views
    fov_x: 7.3,
    fov_z: 0.1,
    offset_x: 0.0,
    offset_z: 0.0,
    err_x: -0.2,
    err_z: 0.6,
    rot_y: -0.2,
    color: "red",
  },
  {
    instrument: "UVS_SP_2",
    fov_x: 0.2,
    fov_z: 0.2,
    offset_x: (7.3 + 0.2) / 2.0,
    offset_z: 0.0,
    err_x: -0.2,
    err_z: 0.6,
    rot_y: -0.2,
    color: "red",
  },
  {
    instrument: "ETHEMIS_1",
    fov_x: 5.852,
    fov_z: 0.9144,
    offset_x: 0.0,
    offset_z: -1.502,
    err_x: 0.05,
    err_z: -0.01,
    rot_y: 0.16,
    color: "yellow",
  },
  {
    instrument: "ETHEMIS_2",
    fov_x: 5.852,
    fov_z: 0.9144,
    offset_x: 0.0,
    offset_z: 0.0,
    err_x: 0.05,
    err_z: -0.01,
    rot_y: 0.16,
    color: "yellow",
  },
  {
    instrument: "ETHEMIS_3",
    fov_x: 5.852,
    fov_z: 0.9144,
    offset_x: 0.0,
    offset_z: 1.594,
    err_x: 0.05,
    err_z: -0.01,
    rot_y: 0.16,
    color: "yellow",
  },
  {
    instrument: "REASON",
    fov_x: 30,
    fov_z: 30,
    offset_x: 0.0,
    offset_z: 0,
    err_x: 0,
    err_z: 0,
    rot_y: 0,
    color: "green",
  },
];


/**
 * Get the SPICE frame name for a given instrument key.
 * @param {string} key - One of the keys in FOV_FRAME_MAP.
 * @returns {string|undefined} The SPICE frame name, or undefined if not found.
 */
export function getFrameName(key) {
  return FOV_FRAME_MAP[key];
}

/**
 * Returns an array of all SPICE frame names for drawing.
 */
export function getAllFrameNames() {
  return Object.values(FOV_FRAME_MAP);
}

function degToRad(deg) {
  return (deg * Math.PI) / 180;
}

export function PrimaryInstrumentFOVsAtNearPlane({ fov, rollDegrees = 0 }) {

  const { camera } = useThree();
  const groupRef = useRef();

  useEffect(() => {
    // Trigger redraw/recompute/etc here
  }, [fov]);

  useFrame(() => {
    if (!groupRef.current) return;
    const group = groupRef.current;

    // Always place at camera
    group.position.copy(camera.position);

      // ─── PRIMARY VIEW: lock rotation relative to camera ───
      const viewDir = new THREE.Vector3();
      camera.getWorldDirection(viewDir).normalize();

      const camUp = camera.up.clone().normalize();

      const rollRad = THREE.MathUtils.degToRad(rollDegrees);
      const rollQuat = new THREE.Quaternion().setFromAxisAngle(viewDir, rollRad);
      const rotatedUp = camUp.clone().applyQuaternion(rollQuat);

      const mat = new THREE.Matrix4().lookAt(
        new THREE.Vector3(0, 0, 0),
        viewDir,
        rotatedUp
      );

      group.setRotationFromMatrix(mat);

  });


  const meshes = useMemo(() => {
    const z = -1e-11;

    return INSTRUMENT_FOVS.map((fov) => {
      const θx = degToRad(fov.fov_x);
      const θz = degToRad(fov.fov_z);
      const halfWidth = Math.tan(θx / 2) * Math.abs(z);
      const halfHeight = Math.tan(θz / 2) * Math.abs(z);

      // apply offsets and errors
      const dx = Math.tan(degToRad(fov.offset_x + fov.err_x)) * Math.abs(z);
      const dz = Math.tan(degToRad(fov.offset_z + fov.err_z)) * Math.abs(z);
      const rotY = degToRad(fov.rot_y);

      // corners around origin (z = -0.1)
      const base = [
        new THREE.Vector3(-halfWidth, -halfHeight, z),
        new THREE.Vector3( halfWidth, -halfHeight, z),
        new THREE.Vector3( halfWidth,  halfHeight, z),
        new THREE.Vector3(-halfWidth,  halfHeight, z),
        new THREE.Vector3(-halfWidth, -halfHeight, z),
      ];

      // rotate around Y
      const rotated = base.map(p => {
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        const x = p.x * cos - p.z * sin;
        const zNew = p.x * sin + p.z * cos;
        return new THREE.Vector3(x + dx, p.y + dz, zNew);
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(rotated);
      const material = new THREE.LineBasicMaterial({ color: fov.color });

      return <line key={fov.instrument} geometry={geometry} material={material} />;
    });
  }, []);

  return <group ref={groupRef}>{meshes}</group>;
}

export function InstrumentFOVsAtNearPlane({ fov, scQuat }) {
  const { camera } = useThree();
  const groupRef = useRef();

  useEffect(() => {
    // Trigger redraw/recompute/etc here
  }, [fov]);

useFrame(() => {
  if (!groupRef.current) return;

  const group = groupRef.current;

  // Step 1: Position FOVs at the camera
  group.position.copy(camera.position);

  // Step 2: Determine SC roll relative to camera forward
  const q = new THREE.Quaternion(...scQuat);

  // SC +Z axis in world frame (was camera.up before)
  const scZ = new THREE.Vector3(0, 0, 1).applyQuaternion(q);

  // World forward (camera direction)
  const viewDir = new THREE.Vector3();
  camera.getWorldDirection(viewDir).normalize();

  // Compute right vector = viewDir × scZ
  const right = new THREE.Vector3().crossVectors(viewDir, scZ).normalize();

  // New up = right × viewDir
  const fovUp = new THREE.Vector3().crossVectors(right, viewDir).normalize();

  // Build a rotation that aligns camera-facing quad with this up vector
  const rotMatrix = new THREE.Matrix4().lookAt(
    new THREE.Vector3(0, 0, 0),         // forward
    viewDir,                            // where to "look"
    fovUp                               // what to treat as "up"
  );
  group.setRotationFromMatrix(rotMatrix);
});


  const meshes = useMemo(() => {
    const z = -1e-11;

    return INSTRUMENT_FOVS.map((fov) => {
      const θx = degToRad(fov.fov_x);
      const θz = degToRad(fov.fov_z);
      const halfWidth = Math.tan(θx / 2) * Math.abs(z);
      const halfHeight = Math.tan(θz / 2) * Math.abs(z);

      // apply offsets and errors
      const dx = Math.tan(degToRad(fov.offset_x + fov.err_x)) * Math.abs(z);
      const dz = Math.tan(degToRad(fov.offset_z + fov.err_z)) * Math.abs(z);
      const rotY = degToRad(fov.rot_y);

      // corners around origin (z = -0.1)
      const base = [
        new THREE.Vector3(-halfWidth, -halfHeight, z),
        new THREE.Vector3( halfWidth, -halfHeight, z),
        new THREE.Vector3( halfWidth,  halfHeight, z),
        new THREE.Vector3(-halfWidth,  halfHeight, z),
        new THREE.Vector3(-halfWidth, -halfHeight, z),
      ];

      // rotate around Y
      const rotated = base.map(p => {
        const cos = Math.cos(rotY);
        const sin = Math.sin(rotY);
        const x = p.x * cos - p.z * sin;
        const zNew = p.x * sin + p.z * cos;
        return new THREE.Vector3(x + dx, p.y + dz, zNew);
      });

      const geometry = new THREE.BufferGeometry().setFromPoints(rotated);
      const material = new THREE.LineBasicMaterial({ color: fov.color });

      return <line key={fov.instrument} geometry={geometry} material={material} />;
    });
  }, []);

  return <group ref={groupRef}>{meshes}</group>;
}