// Low-poly "architectural model" builders for the 3D floor view.
// Client-only (imported by the dynamically loaded scene).
import * as THREE from "three";
import { chairSpots, FLOOR_COLORS, type FloorObjectData } from "@/lib/floor";

const LIGHT_PALETTE = {
  background: "#F4F2EE",
  floor: "#ECE7DF",
  wall: "#FAF8F5",
  edge: "#1F1F1F",
  wood: "#D6BE9F",
  woodTop: "#B08F69",
  barWood: "#93704F",
  stainless: "#CBD0D4",
  dark: "#3B3D40",
  frame: "#5D5F62",
  kitchenFloor: "#D9DAD7",
  fridge: "#EEF0F1",
  mat: "#4A4B4D",
  pot: "#C09C78",
  leaves: "#7D8E6C",
  selection: "#CC7736",
  gridMajor: "#BDB6A9",
  gridMinor: "#D9D3C8",
};

const DARK_PALETTE: typeof LIGHT_PALETTE = {
  background: "#141416",
  floor: "#2A2826",
  wall: "#3A3734",
  edge: "#000000",
  wood: "#8C6F52",
  woodTop: "#6F553D",
  barWood: "#5B4430",
  stainless: "#7E848B",
  dark: "#1C1D1F",
  frame: "#4A4C50",
  kitchenFloor: "#333537",
  fridge: "#5C6064",
  mat: "#18191A",
  pot: "#76604A",
  leaves: "#5B7650",
  selection: "#E08A48",
  gridMajor: "#4A4642",
  gridMinor: "#363330",
};

/** Colours of the current theme (switched by the engine when light / dark changes). */
export let PALETTE = LIGHT_PALETTE;
export function setPalette(dark: boolean) {
  PALETTE = dark ? DARK_PALETTE : LIGHT_PALETTE;
}

/** Materials shared by every object; disposed with the engine, not per object. */
export class SharedMaterials {
  private cache = new Map<string, THREE.Material>();
  standard(color: string, roughness = 0.8, metalness = 0) {
    const key = `s|${color}|${roughness}|${metalness}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshStandardMaterial({ color, roughness, metalness });
      m.userData.shared = true;
      this.cache.set(key, m);
    }
    return m as THREE.MeshStandardMaterial;
  }
  edges() {
    let m = this.cache.get("edges");
    if (!m) {
      m = new THREE.LineBasicMaterial({ color: PALETTE.edge, transparent: true, opacity: 0.16 });
      m.userData.shared = true;
      this.cache.set("edges", m);
    }
    return m as THREE.LineBasicMaterial;
  }
  basic(color: string) {
    const key = `b|${color}`;
    let m = this.cache.get(key);
    if (!m) {
      m = new THREE.MeshBasicMaterial({ color });
      m.userData.shared = true;
      this.cache.set(key, m);
    }
    return m as THREE.MeshBasicMaterial;
  }
  dispose() {
    this.cache.forEach((m) => m.dispose());
    this.cache.clear();
  }
}

export type LabelHandle = { object: { visible: boolean }; setText: (main: string, sub?: string, color?: string | null) => void };

export type BuiltObject = {
  data: FloorObjectData;
  group: THREE.Group;
  pickables: THREE.Mesh[];
  /** Coloured by status: table top / pickup counter top. */
  primary: THREE.MeshStandardMaterial[];
  /** Lighter tint of the status colour: chair seats and backs. */
  secondary: THREE.MeshStandardMaterial[];
  anchorY: number;
  footprint: { w: number; d: number };
};

type Opts = { x?: number; y?: number; z?: number; edges?: boolean; cast?: boolean; receive?: boolean };

function mesh(parent: THREE.Object3D, geometry: THREE.BufferGeometry, material: THREE.Material, kit: SharedMaterials, o: Opts = {}) {
  const m = new THREE.Mesh(geometry, material);
  m.position.set(o.x ?? 0, o.y ?? 0, o.z ?? 0);
  m.castShadow = o.cast ?? true;
  m.receiveShadow = o.receive ?? true;
  if (o.edges) m.add(new THREE.LineSegments(new THREE.EdgesGeometry(geometry, 25), kit.edges()));
  parent.add(m);
  return m;
}

/** Box resting on y (bottom at y). */
function box(parent: THREE.Object3D, kit: SharedMaterials, w: number, h: number, d: number, mat: THREE.Material, o: Opts = {}) {
  return mesh(parent, new THREE.BoxGeometry(w, h, d), mat, kit, { ...o, y: (o.y ?? 0) + h / 2 });
}

function statusMaterial(color: string, roughness: number) {
  return new THREE.MeshStandardMaterial({ color, roughness, metalness: 0 });
}

function buildTable(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials, primary: THREE.MeshStandardMaterial[], secondary: THREE.MeshStandardMaterial[]) {
  const top = statusMaterial(FLOOR_COLORS.free, 0.55);
  const seat = statusMaterial(FLOOR_COLORS.free, 0.7);
  primary.push(top);
  secondary.push(seat);
  const frame = kit.standard(PALETTE.frame, 0.6, 0.2);
  const h = 0.75;
  if (o.shape === "ROUND") {
    const r = Math.max(o.width, o.depth) / 2;
    mesh(g, new THREE.CylinderGeometry(r, r, 0.04, 40), top, kit, { y: h - 0.02, edges: true });
    mesh(g, new THREE.CylinderGeometry(0.04, 0.04, h - 0.06, 12), frame, kit, { y: (h - 0.04) / 2 });
    mesh(g, new THREE.CylinderGeometry(0.24, 0.26, 0.03, 24), frame, kit, { y: 0.015 });
  } else {
    box(g, kit, o.width, 0.04, o.depth, top, { y: h - 0.04, edges: true });
    const ix = o.width / 2 - 0.06;
    const iz = o.depth / 2 - 0.06;
    for (const [x, z] of [
      [ix, iz],
      [-ix, iz],
      [ix, -iz],
      [-ix, -iz],
    ])
      box(g, kit, 0.04, h - 0.04, 0.04, frame, { x, z });
  }
  for (const s of chairSpots(o)) {
    const c = new THREE.Group();
    c.position.set(s.x, 0, s.z);
    c.rotation.y = s.facing; // local +z faces the table
    box(c, kit, 0.42, 0.05, 0.42, seat, { y: 0.43, edges: true });
    box(c, kit, 0.42, 0.42, 0.04, seat, { y: 0.48, z: -0.19, edges: true });
    for (const [x, z] of [
      [0.18, 0.18],
      [-0.18, 0.18],
      [0.18, -0.18],
      [-0.18, -0.18],
    ])
      box(c, kit, 0.03, 0.43, 0.03, frame, { x, z });
    g.add(c);
  }
  const reach = o.seats ? 0.62 : 0.1;
  const round = o.shape === "ROUND";
  const size = Math.max(o.width, o.depth);
  return {
    anchorY: 1.15,
    footprint: round ? { w: size + reach * 2, d: size + reach * 2 } : { w: o.width + reach * 2, d: o.depth + reach * 2 },
  };
}

function buildCounter(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials, bar: boolean) {
  const body = kit.standard(bar ? PALETTE.barWood : PALETTE.wood, 0.75);
  box(g, kit, o.width, 0.98, o.depth, body, { edges: true });
  box(g, kit, o.width + 0.04, 0.04, o.depth + 0.04, kit.standard(PALETTE.woodTop, 0.5), { y: 0.98, edges: true });
  if (bar) {
    for (let i = 0; i < 3; i++) {
      mesh(g, new THREE.CylinderGeometry(0.05, 0.04, 0.12, 12), kit.standard("#F2F1EC", 0.4), kit, {
        x: (i - 1) * Math.min(0.35, o.width / 4),
        y: 1.08,
        z: 0,
      });
    }
  } else {
    // POS terminal at one end, tilted towards the cashier.
    const pos = new THREE.Group();
    pos.position.set(o.width / 2 - 0.35, 1.02, 0);
    box(pos, kit, 0.12, 0.08, 0.12, kit.standard(PALETTE.dark, 0.5));
    const screen = box(pos, kit, 0.34, 0.24, 0.03, kit.standard(PALETTE.dark, 0.4), { y: 0.08, edges: true });
    screen.rotation.x = -0.35;
    g.add(pos);
  }
  return { anchorY: 1.45, footprint: { w: o.width + 0.2, d: o.depth + 0.2 } };
}

function buildPass(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials, primary: THREE.MeshStandardMaterial[]) {
  box(g, kit, o.width, 0.94, o.depth, kit.standard(PALETTE.stainless, 0.35, 0.4), { edges: true });
  const top = statusMaterial(PALETTE.stainless, 0.4);
  primary.push(top);
  box(g, kit, o.width + 0.02, 0.04, o.depth + 0.02, top, { y: 0.94, edges: true });
  const post = kit.standard(PALETTE.dark, 0.5);
  for (const x of [o.width / 2 - 0.05, -o.width / 2 + 0.05]) box(g, kit, 0.03, 0.62, 0.03, post, { x, y: 0.98 });
  box(g, kit, o.width, 0.06, Math.min(0.2, o.depth), post, { y: 1.6, edges: true });
  return { anchorY: 1.95, footprint: { w: o.width + 0.2, d: o.depth + 0.2 } };
}

function buildKitchen(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials) {
  const tile = mesh(g, new THREE.PlaneGeometry(o.width, o.depth), kit.standard(PALETTE.kitchenFloor, 0.9), kit, { y: 0.004, cast: false });
  tile.rotation.x = -Math.PI / 2;
  const wall = kit.standard(PALETTE.wall, 0.9);
  const t = 0.1;
  box(g, kit, o.width, 1.1, t, wall, { z: -o.depth / 2 + t / 2, edges: true });
  box(g, kit, t, 1.1, o.depth, wall, { x: -o.width / 2 + t / 2, edges: true });
  box(g, kit, t, 1.1, o.depth, wall, { x: o.width / 2 - t / 2, edges: true });
  const back = -o.depth / 2 + t + 0.36;
  if (o.width >= 2.2 && o.depth >= 1.6) {
    box(g, kit, 0.7, 1.9, 0.65, kit.standard(PALETTE.fridge, 0.5), { x: -o.width / 2 + t + 0.4, z: back, edges: true });
    const stoveW = Math.min(1.4, o.width * 0.3);
    box(g, kit, stoveW, 0.88, 0.7, kit.standard(PALETTE.stainless, 0.35, 0.4), { x: 0.1, z: back, edges: true });
    box(g, kit, stoveW, 0.03, 0.7, kit.standard(PALETTE.dark, 0.5), { x: 0.1, y: 0.88, z: back });
    const prepW = Math.min(1.6, o.width * 0.35);
    box(g, kit, prepW, 0.9, 0.62, kit.standard(PALETTE.stainless, 0.35, 0.4), {
      x: o.width / 2 - t - prepW / 2 - 0.1,
      z: back,
      edges: true,
    });
  }
  return { anchorY: 2.2, footprint: { w: o.width + 0.1, d: o.depth + 0.1 } };
}

function buildEntrance(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials) {
  box(g, kit, o.width, 0.015, o.depth, kit.standard(PALETTE.mat, 0.95), { cast: false });
  return { anchorY: 0.45, footprint: { w: o.width + 0.2, d: o.depth + 0.2 } };
}

function buildWall(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials) {
  box(g, kit, o.width, 1.2, o.depth, kit.standard(PALETTE.wall, 0.9), { edges: true });
  return { anchorY: 1.45, footprint: { w: o.width + 0.15, d: o.depth + 0.15 } };
}

function buildPlant(o: FloorObjectData, g: THREE.Group, kit: SharedMaterials) {
  const r = Math.min(o.width, o.depth) / 2;
  mesh(g, new THREE.CylinderGeometry(r * 0.7, r * 0.55, 0.42, 20), kit.standard(PALETTE.pot, 0.85), kit, { y: 0.21, edges: true });
  const leaves = new THREE.IcosahedronGeometry(r * 1.05, 1);
  const m = mesh(g, leaves, new THREE.MeshStandardMaterial({ color: PALETTE.leaves, roughness: 0.9, flatShading: true }), kit, {
    y: 0.42 + r * 0.95,
  });
  m.scale.set(1, 1.15, 1);
  return { anchorY: 0.6 + r * 2.4, footprint: { w: r * 2 + 0.2, d: r * 2 + 0.2 } };
}

export function buildObject(o: FloorObjectData, kit: SharedMaterials): BuiltObject {
  const group = new THREE.Group();
  group.position.set(o.x, 0, o.z);
  group.rotation.y = (-o.rotation * Math.PI) / 180; // clockwise when seen from above
  const primary: THREE.MeshStandardMaterial[] = [];
  const secondary: THREE.MeshStandardMaterial[] = [];
  let meta: { anchorY: number; footprint: { w: number; d: number } };
  switch (o.kind) {
    case "TABLE":
      meta = buildTable(o, group, kit, primary, secondary);
      break;
    case "COUNTER":
      meta = buildCounter(o, group, kit, false);
      break;
    case "BAR":
      meta = buildCounter(o, group, kit, true);
      break;
    case "PASS":
      meta = buildPass(o, group, kit, primary);
      break;
    case "KITCHEN":
      meta = buildKitchen(o, group, kit);
      break;
    case "ENTRANCE":
      meta = buildEntrance(o, group, kit);
      break;
    case "WALL":
      meta = buildWall(o, group, kit);
      break;
    default:
      meta = buildPlant(o, group, kit);
  }
  const pickables: THREE.Mesh[] = [];
  group.traverse((c) => {
    c.userData.objectId = o.id;
    if ((c as THREE.Mesh).isMesh) pickables.push(c as THREE.Mesh);
  });
  return { data: o, group, pickables, primary, secondary, ...meta };
}

/** Floor plane and low perimeter walls, with gaps where an entrance touches a wall. */
export function buildRoom(width: number, depth: number, objects: FloorObjectData[], kit: SharedMaterials) {
  const room = new THREE.Group();
  const floor = mesh(room, new THREE.PlaneGeometry(width, depth), kit.standard(PALETTE.floor, 0.95), kit, { cast: false });
  floor.rotation.x = -Math.PI / 2;
  floor.userData.isFloor = true;

  const h = 0.7;
  const t = 0.12;
  const wallMat = kit.standard(PALETTE.wall, 0.9);
  const entrances = objects.filter((o) => o.kind === "ENTRANCE");
  // Each edge: fixed coordinate, axis it runs along, half-length.
  const edges = [
    { axis: "x" as const, fixed: depth / 2 + t / 2, half: width / 2 + t, side: "front" },
    { axis: "x" as const, fixed: -depth / 2 - t / 2, half: width / 2 + t, side: "back" },
    { axis: "z" as const, fixed: width / 2 + t / 2, half: depth / 2, side: "right" },
    { axis: "z" as const, fixed: -width / 2 - t / 2, half: depth / 2, side: "left" },
  ];
  for (const e of edges) {
    const gaps: [number, number][] = [];
    for (const en of entrances) {
      const rot = ((Math.round(en.rotation / 90) % 2) + 2) % 2 === 1;
      const ew = rot ? en.depth : en.width;
      const ed = rot ? en.width : en.depth;
      const along = e.axis === "x" ? en.x : en.z;
      const across = e.axis === "x" ? en.z : en.x;
      const span = e.axis === "x" ? ew : ed;
      const reach = (e.axis === "x" ? ed : ew) / 2 + 0.9;
      if (Math.abs(Math.abs(across) - (Math.abs(e.fixed) - t / 2)) <= reach && Math.sign(across) === Math.sign(e.fixed)) {
        gaps.push([along - span / 2, along + span / 2]);
      }
    }
    gaps.sort((a, b) => a[0] - b[0]);
    let start = -e.half;
    const segments: [number, number][] = [];
    for (const [a, b] of gaps) {
      if (a > start) segments.push([start, Math.min(a, e.half)]);
      start = Math.max(start, b);
    }
    if (start < e.half) segments.push([start, e.half]);
    for (const [a, b] of segments) {
      const len = b - a;
      if (len < 0.05) continue;
      const mid = (a + b) / 2;
      if (e.axis === "x") box(room, kit, len, h, t, wallMat, { x: mid, z: e.fixed, edges: true });
      else box(room, kit, t, h, len, wallMat, { x: e.fixed, z: mid, edges: true });
    }
  }
  return { room, floor };
}

/** Rectangle "tape" around the selected object, as a child of its group. */
export function buildSelection(b: BuiltObject, kit: SharedMaterials) {
  const g = new THREE.Group();
  const mat = kit.basic(PALETTE.selection);
  const { w, d } = b.footprint;
  const t = 0.05;
  const y = 0.012;
  for (const [sx, sz, px, pz] of [
    [w + t, t, 0, d / 2],
    [w + t, t, 0, -d / 2],
    [t, d, w / 2, 0],
    [t, d, -w / 2, 0],
  ]) {
    const m = new THREE.Mesh(new THREE.BoxGeometry(sx, 0.01, sz), mat);
    m.position.set(px, y, pz);
    g.add(m);
  }
  g.userData.selection = true;
  return g;
}

/** Dispose geometries and per-object materials under `root` (shared materials are kept). */
export function disposeTree(root: THREE.Object3D) {
  root.traverse((c) => {
    const m = c as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mats = m.material ? (Array.isArray(m.material) ? m.material : [m.material]) : [];
    for (const mat of mats) if (!mat.userData.shared) mat.dispose();
  });
}

/** Mix a hex colour with white (amount 0–1). */
export function tint(hex: string, amount: number) {
  const c = new THREE.Color(hex);
  return "#" + c.lerp(new THREE.Color("#ffffff"), amount).getHexString();
}
