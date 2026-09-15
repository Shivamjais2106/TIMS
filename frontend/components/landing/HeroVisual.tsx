'use client';

import { Canvas, useFrame } from '@react-three/fiber';
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { BHOPAL_BBOX } from '@/lib/bhopal';

/**
 * Landing-page hero visual.
 *
 * A slowly rotating point-cloud globe with a wireframe latitude/longitude cage
 * and a small cluster of rust-coloured points over central India, suggesting
 * satellite coverage narrowing to the pilot area.
 *
 * Deliberately restrained: two colours, no bloom, no post-processing, one slow
 * rotation. This is the only page in the project that loads Three.js.
 */

const GLOBE_RADIUS = 1.62;

/** Points on the sphere, distributed with the Fibonacci lattice. */
function useGlobePoints(count: number) {
  return useMemo(() => {
    const positions = new Float32Array(count * 3);
    // Golden-angle spiral: gives an even distribution without the polar
    // clustering that naive random lat/lon sampling produces.
    const golden = Math.PI * (3 - Math.sqrt(5));

    for (let index = 0; index < count; index += 1) {
      const y = 1 - (index / (count - 1)) * 2;
      const radius = Math.sqrt(Math.max(0, 1 - y * y));
      const theta = golden * index;

      positions[index * 3] = Math.cos(theta) * radius * GLOBE_RADIUS;
      positions[index * 3 + 1] = y * GLOBE_RADIUS;
      positions[index * 3 + 2] = Math.sin(theta) * radius * GLOBE_RADIUS;
    }

    return positions;
  }, [count]);
}

/** Converts lat/lon to a position on the globe. */
function toVector(latitude: number, longitude: number, radius = GLOBE_RADIUS): THREE.Vector3 {
  const phi = (90 - latitude) * (Math.PI / 180);
  const theta = (longitude + 180) * (Math.PI / 180);
  return new THREE.Vector3(
    -radius * Math.sin(phi) * Math.cos(theta),
    radius * Math.cos(phi),
    radius * Math.sin(phi) * Math.sin(theta),
  );
}

function GlobePoints() {
  const positions = useGlobePoints(2600);
  const ref = useRef<THREE.Points>(null);

  useFrame((_state, delta) => {
    // ~0.9 degrees per second. Slow enough to read as monitoring rather than
    // as a spinning logo.
    if (ref.current) ref.current.rotation.y += delta * 0.016;
  });

  return (
    <points ref={ref}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        color="#7a8086"
        size={0.013}
        sizeAttenuation
        transparent
        opacity={0.55}
        depthWrite={false}
      />
    </points>
  );
}

/** Latitude and longitude cage. */
function Graticule() {
  const ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.y += delta * 0.016;
  });

  const rings = useMemo(() => {
    const geometries: Array<{ geometry: THREE.BufferGeometry; key: string }> = [];

    // Parallels.
    for (let latitude = -60; latitude <= 60; latitude += 30) {
      const points: THREE.Vector3[] = [];
      for (let longitude = -180; longitude <= 180; longitude += 4) {
        points.push(toVector(latitude, longitude, GLOBE_RADIUS * 1.001));
      }
      geometries.push({
        geometry: new THREE.BufferGeometry().setFromPoints(points),
        key: `lat-${latitude}`,
      });
    }

    // Meridians.
    for (let longitude = -180; longitude < 180; longitude += 30) {
      const points: THREE.Vector3[] = [];
      for (let latitude = -90; latitude <= 90; latitude += 4) {
        points.push(toVector(latitude, longitude, GLOBE_RADIUS * 1.001));
      }
      geometries.push({
        geometry: new THREE.BufferGeometry().setFromPoints(points),
        key: `lon-${longitude}`,
      });
    }

    return geometries;
  }, []);

  // BufferGeometry is not garbage-collected by three; without an explicit
  // dispose each hot reload or route change leaks ~40 geometries, which is
  // what eventually triggers "THREE.WebGLRenderer: Context Lost".
  useEffect(
    () => () => {
      for (const ring of rings) ring.geometry.dispose();
    },
    [rings],
  );

  return (
    <group ref={ref}>
      {rings.map((ring) => (
        <line key={ring.key}>
          <primitive object={ring.geometry} attach="geometry" />
          <lineBasicMaterial color="#1d2226" transparent opacity={0.85} />
        </line>
      ))}
    </group>
  );
}

/**
 * The pilot-area marker cluster.
 *
 * Positioned from the real BHOPAL_BBOX centroid, so the highlighted point on
 * the globe is actually over Bhopal rather than decorative.
 */
function PilotCluster() {
  const ref = useRef<THREE.Group>(null);

  const centre = useMemo(() => {
    const latitude = (BHOPAL_BBOX.minLat + BHOPAL_BBOX.maxLat) / 2;
    const longitude = (BHOPAL_BBOX.minLng + BHOPAL_BBOX.maxLng) / 2;
    return toVector(latitude, longitude, GLOBE_RADIUS * 1.012);
  }, []);

  // A few points scattered around the pilot centre, suggesting detections.
  const scatter = useMemo(() => {
    const points: THREE.Vector3[] = [];
    const baseLat = (BHOPAL_BBOX.minLat + BHOPAL_BBOX.maxLat) / 2;
    const baseLng = (BHOPAL_BBOX.minLng + BHOPAL_BBOX.maxLng) / 2;

    // Deterministic offsets, so the hero renders identically on every load and
    // in every screenshot.
    const offsets = [
      [1.8, 2.4],
      [-2.2, 1.6],
      [3.1, -1.9],
      [-1.4, -2.8],
      [4.2, 3.3],
      [-3.6, 2.9],
      [2.4, -3.8],
    ];

    for (const [dLat, dLng] of offsets) {
      points.push(toVector(baseLat + dLat, baseLng + dLng, GLOBE_RADIUS * 1.008));
    }
    return points;
  }, []);

  // Elapsed time is accumulated from the per-frame delta rather than read from
  // state.clock: three 0.186 deprecates THREE.Clock in favour of THREE.Timer,
  // and touching it logs a warning on every mount.
  const elapsed = useRef(0);

  useFrame((_state, delta) => {
    if (!ref.current) return;
    elapsed.current += delta;
    ref.current.rotation.y += delta * 0.016;

    // Slow breathing on the primary marker only.
    const pulse = 1 + Math.sin(elapsed.current * 1.1) * 0.16;
    const marker = ref.current.children[0];
    if (marker) marker.scale.setScalar(pulse);
  });

  return (
    <group ref={ref}>
      <mesh position={centre}>
        <sphereGeometry args={[0.032, 12, 12]} />
        <meshBasicMaterial color="#c1502e" />
      </mesh>

      {scatter.map((position, index) => (
        <mesh key={index} position={position}>
          <sphereGeometry args={[0.014, 8, 8]} />
          <meshBasicMaterial color="#c1502e" transparent opacity={0.6} />
        </mesh>
      ))}
    </group>
  );
}

/** Two orbital rings, suggesting polar-orbiting satellites. */
function OrbitRings() {
  const ref = useRef<THREE.Group>(null);

  useFrame((_state, delta) => {
    if (ref.current) ref.current.rotation.z += delta * 0.05;
  });

  return (
    <group ref={ref}>
      <mesh rotation={[Math.PI / 2.4, 0, 0]}>
        <torusGeometry args={[2.16, 0.0022, 6, 140]} />
        <meshBasicMaterial color="#2a3137" />
      </mesh>
      <mesh rotation={[Math.PI / 1.7, 0.5, 0]}>
        <torusGeometry args={[2.38, 0.0018, 6, 140]} />
        <meshBasicMaterial color="#1d2226" />
      </mesh>
    </group>
  );
}

export function HeroVisual() {
  return (
    <Canvas
      // Recover rather than leaving a dead black rectangle if the browser
      // drops the GL context (tab backgrounded, GPU reset, driver hiccup).
      onCreated={({ gl }) => {
        const canvas = gl.domElement;
        canvas.addEventListener('webglcontextlost', (event) => {
          event.preventDefault();
        });
      }}
      camera={{ position: [0, 0.45, 4.5], fov: 42 }}
      // No alpha buffer needed — the page substrate is already near-black, and
      // a transparent canvas costs a compositing pass for no visible gain.
      gl={{ antialias: true, alpha: true }}
      dpr={[1, 2]}
      // frameloop="always" is required for the rotation, but the scene is a few
      // thousand points with basic materials and no lights, so it stays cheap.
      style={{ pointerEvents: 'none' }}
      aria-hidden
    >
      <GlobePoints />
      <Graticule />
      <PilotCluster />
      <OrbitRings />
    </Canvas>
  );
}

export default HeroVisual;
