// src/utils/getWorldPos.js

import * as THREE from "three";
import { SAT_PARENT } from "./constants"; // adjust path as needed

/**
 * Compute the world‐space position of a body (or the spacecraft).
 *
 * @param {string} name     – name of the body or "Spacecraft"
 * @param {Array}  bodies   – list of { name, pos: [x,y,z] } objects
 * @param {Array}  scPos    – [x,y,z] of the spacecraft
 * @returns {THREE.Vector3|null}
 */
export function getWorldPos(name, bodies, scPos) {
  if (name === "Spacecraft") {
    return new THREE.Vector3(...scPos);
  }
  const b = bodies.find((b) => b.name === name);
  if (!b) return null;

  const parentName = SAT_PARENT[name];
  const parent =
    parentName && bodies.find((p) => p.name === parentName);

  if (parent) {
    return new THREE.Vector3(
      parent.pos[0] + b.pos[0],
      parent.pos[1] + b.pos[1],
      parent.pos[2] + b.pos[2]
    );
  }

  return new THREE.Vector3(...b.pos);
}