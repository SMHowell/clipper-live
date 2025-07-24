import * as THREE from "three";
import React, { useMemo, useRef } from "react";
import { useThree, useFrame } from "@react-three/fiber";
import fovData from "./spice_fov_lookup.json";

// Logical keys for primary instrument FOVs
export const FOV_FRAME_MAP = {
  EIS_NAC:    "EUROPAM_EIS_NAC",
  EIS_WAC:    "EUROPAM_EIS_WAC",
  ETHEMIS:    "EUROPAM_ETHEMIS",
  UVS_AP:     "EUROPAM_UVS_AP",
  UVS_SP:     "EUROPAM_UVS_SP",
  REASON:     "EUROPAM_REASON",
  MISE:       "EUROPAM_MISE",
};

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

export function InstrumentFOVsAtNearPlane() {
  const { camera } = useThree();
  const groupRef = useRef();

  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(camera.position);
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  const meshes = useMemo(() => {
    const z = -1e-12;

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