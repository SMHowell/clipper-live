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
  const frameNames = getAllFrameNames();

  // 🧭 Point and place group where the camera is
  useFrame(() => {
    if (groupRef.current) {
      groupRef.current.position.copy(camera.position);
      groupRef.current.quaternion.copy(camera.quaternion);
    }
  });

  const meshes = useMemo(() => {
    const z = -1e-12; // distance in camera-local frame
    const material = new THREE.LineBasicMaterial({ color: "lime" });

    return Object.entries(fovData)
      .filter(([_, fov]) => frameNames.includes(fov.frame))
      .map(([id, fov]) => {
        const θx = degToRad(fov.ref_angle);
        const θy = degToRad(fov.cross_angle ?? fov.ref_angle);

        const hw = Math.tan(θx / 2) * Math.abs(z);
        const hh = Math.tan(θy / 2) * Math.abs(z);

        const corners = [
          new THREE.Vector3(-hw, -hh, z),
          new THREE.Vector3( hw, -hh, z),
          new THREE.Vector3( hw,  hh, z),
          new THREE.Vector3(-hw,  hh, z),
          new THREE.Vector3(-hw, -hh, z),
        ].filter(v => v.toArray().every(Number.isFinite));

        if (corners.length < 5) {
          console.warn("Skipping bad FOV:", id);
          return null;
        }

        const geometry = new THREE.BufferGeometry().setFromPoints(corners);
        return <line key={id} geometry={geometry} material={material} />;
      });
  }, []);

  return <group ref={groupRef}>{meshes}</group>;
}
