// Writes web/public/models/drone.gltf: a simple "+" quadcopter (matching SITL's --model +), about 0.6 m across, made of
// boxes: dark body, grey arms, light rotor discs, a red nose marking the front and a green right-hand rotor. Our own geometry (no third-party
// model; see docs/credits.md). glTF 2.0, Y up, one embedded buffer.  node scripts/make-drone-model.mjs
import { mkdirSync, writeFileSync } from 'node:fs';

// the front is glTF +Z: Cesium treats +Z as a glTF 2.0 model's forward axis, which its roll turns about. Measured
// 2026-10-09 with the nose on +X: Cesium pitch then turned the drone about its nose and Cesium roll about its wings.
const NOSE_AXIS = '+Z';

// a box centred at c with size s: 24 vertices (flat normals per face), 36 indices
function box([cx, cy, cz], [sx, sy, sz]) {
  const [hx, hy, hz] = [sx / 2, sy / 2, sz / 2];
  const faces = [
    [[1, 0, 0], [[hx, -hy, -hz], [hx, hy, -hz], [hx, hy, hz], [hx, -hy, hz]]],
    [[-1, 0, 0], [[-hx, -hy, hz], [-hx, hy, hz], [-hx, hy, -hz], [-hx, -hy, -hz]]],
    [[0, 1, 0], [[-hx, hy, -hz], [-hx, hy, hz], [hx, hy, hz], [hx, hy, -hz]]],
    [[0, -1, 0], [[-hx, -hy, hz], [-hx, -hy, -hz], [hx, -hy, -hz], [hx, -hy, hz]]],
    [[0, 0, 1], [[hx, -hy, hz], [hx, hy, hz], [-hx, hy, hz], [-hx, -hy, hz]]],
    [[0, 0, -1], [[-hx, -hy, -hz], [-hx, hy, -hz], [hx, hy, -hz], [hx, -hy, -hz]]],
  ];
  const pos = [], nor = [], idx = [];
  for (const [n, quad] of faces) {
    const b = pos.length / 3;
    for (const [x, y, z] of quad) pos.push(cx + x, cy + y, cz + z), nor.push(...n);
    idx.push(b, b + 1, b + 2, b, b + 2, b + 3);
  }
  return { pos, nor, idx };
}

const R = 0.25; // arm length from the centre
const parts = {
  body: { color: [0.12, 0.13, 0.16, 1], boxes: [box([0, 0, 0], [0.16, 0.07, 0.16])] },
  arms: { color: [0.55, 0.57, 0.6, 1], boxes: [box([0, 0, 0], [2 * R, 0.025, 0.03]), box([0, 0, 0], [0.03, 0.025, 2 * R])] },
  rotors: { color: [0.85, 0.87, 0.9, 1], boxes: [[R, 0], [0, R], [0, -R]].map(([x, z]) => box([x, 0.03, z], [0.2, 0.01, 0.2])) },
  // the right-hand (starboard) rotor is green, like an aircraft's starboard light: nose +Z, up +Y, so right is -X
  starboard: { color: [0.1, 0.75, 0.2, 1], boxes: [box([-R, 0.03, 0], [0.2, 0.01, 0.2])] },
  nose: { color: [0.9, 0.12, 0.1, 1], boxes: [box([0, 0.02, 0.11], [0.06, 0.05, 0.08])] },
};

const chunks = [], accessors = [], views = [], meshes = [], materials = [];
let offset = 0;
const push = (typedArray, target) => {
  const bytes = Buffer.from(typedArray.buffer);
  views.push({ buffer: 0, byteOffset: offset, byteLength: bytes.length, target });
  chunks.push(bytes);
  offset += bytes.length;
  while (offset % 4) chunks.push(Buffer.alloc(1)), offset++;
  return views.length - 1;
};
for (const [name, { color, boxes }] of Object.entries(parts)) {
  const pos = [], nor = [], idx = [];
  for (const b of boxes) {
    const base = pos.length / 3;
    pos.push(...b.pos), nor.push(...b.nor), idx.push(...b.idx.map((i) => i + base));
  }
  const min = [0, 1, 2].map((k) => Math.min(...pos.filter((_, i) => i % 3 === k)));
  const max = [0, 1, 2].map((k) => Math.max(...pos.filter((_, i) => i % 3 === k)));
  const pv = push(new Float32Array(pos), 34962), nv = push(new Float32Array(nor), 34962), iv = push(new Uint16Array(idx), 34963);
  accessors.push({ bufferView: pv, componentType: 5126, count: pos.length / 3, type: 'VEC3', min, max });
  accessors.push({ bufferView: nv, componentType: 5126, count: nor.length / 3, type: 'VEC3' });
  accessors.push({ bufferView: iv, componentType: 5123, count: idx.length, type: 'SCALAR' });
  materials.push({ name, pbrMetallicRoughness: { baseColorFactor: color, metallicFactor: 0.1, roughnessFactor: 0.7 } });
  const a = accessors.length - 3;
  meshes.push({ name, primitives: [{ attributes: { POSITION: a, NORMAL: a + 1 }, indices: a + 2, material: materials.length - 1 }] });
}
const buffer = Buffer.concat(chunks);
const gltf = {
  asset: { version: '2.0', generator: 'drone-world-simulator scripts/make-drone-model.mjs', copyright: 'Drone World Simulator project (own work)' },
  extras: { noseAxis: NOSE_AXIS },
  scene: 0,
  scenes: [{ nodes: meshes.map((_, i) => i) }],
  nodes: meshes.map((m, i) => ({ name: m.name, mesh: i })),
  meshes,
  materials,
  accessors,
  bufferViews: views,
  buffers: [{ byteLength: buffer.length, uri: `data:application/octet-stream;base64,${buffer.toString('base64')}` }],
};
const out = new URL('../web/public/models/drone.gltf', import.meta.url);
mkdirSync(new URL('.', out), { recursive: true });
writeFileSync(out, JSON.stringify(gltf));
console.log(`wrote ${out.pathname} (${JSON.stringify(gltf).length} bytes, ${meshes.length} meshes, nose ${NOSE_AXIS})`);
