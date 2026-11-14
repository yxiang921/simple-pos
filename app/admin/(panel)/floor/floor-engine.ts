// Imperative three.js engine for the floor view. Client-only.
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { CSS2DObject, CSS2DRenderer } from "three/addons/renderers/CSS2DRenderer.js";
import { computeFloorStatus, formatAge, heatColor, type FloorObjectData, type FloorOrder } from "@/lib/floor";
import { buildObject, buildRoom, buildSelection, disposeTree, PALETTE, setPalette, SharedMaterials, tint, type BuiltObject } from "./three-builders";

export type EngineCallbacks = {
  onSelect: (id: string | null) => void;
  onMove: (id: string, x: number, z: number) => void;
  tooltip: () => HTMLElement | null;
};

type Entry = BuiltObject & {
  label: CSS2DObject;
  labelMain: HTMLSpanElement;
  labelSub: HTMLSpanElement;
  labelDot: HTMLSpanElement;
  overdue: boolean;
  color: string;
};

const SNAP = 0.1;
const ALWAYS_LABELLED = new Set(["TABLE", "PASS", "COUNTER", "KITCHEN", "BAR", "ENTRANCE"]);

export class FloorEngine {
  private renderer: THREE.WebGLRenderer;
  private labels: CSS2DRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private controls: OrbitControls;
  private kit = new SharedMaterials();
  private raycaster = new THREE.Raycaster();
  private ndc = new THREE.Vector2();
  private floorPlane = new THREE.Plane(new THREE.Vector3(0, 1, 0), 0);
  private sun: THREE.DirectionalLight;
  private hemi: THREE.HemisphereLight;
  private dark = false;
  private lastLayout: { objects: FloorObjectData[]; width: number; depth: number } | null = null;
  private room: THREE.Group | null = null;
  private grid: THREE.LineSegments | null = null;
  private entries = new Map<string, Entry>();
  private pickables: THREE.Mesh[] = [];
  private selection: THREE.Group | null = null;
  private resizeObserver: ResizeObserver;

  private width = 14;
  private depth = 10;
  private mode: "view" | "edit" = "view";
  private orders: FloorOrder[] = [];
  private alertMinutes = 20;
  private clockOffset = 0;
  private selectedId: string | null = null;
  private hasLayout = false;

  private dirty = true;
  private lastStatus = 0;
  private anyOverdue = false;
  private down: { x: number; y: number; id: string | null } | null = null;
  private drag: { entry: Entry; offset: THREE.Vector3; moved: boolean } | null = null;
  private fly: { t0: number; from: THREE.Vector3; to: THREE.Vector3; camFrom: THREE.Vector3; camTo: THREE.Vector3 } | null = null;
  private disposed = false;

  constructor(
    private container: HTMLElement,
    private cb: EngineCallbacks,
  ) {
    // Transparent canvas: the lit, theme-aware stage behind it shows through.
    this.renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "low-power" });
    if (!this.renderer.getContext()) throw new Error("WebGL is not available");
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.NoToneMapping;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.setClearColor(0x000000, 0);
    this.dark = document.documentElement.classList.contains("dark");
    setPalette(this.dark);
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    this.renderer.domElement.tabIndex = 0;
    this.renderer.domElement.setAttribute("aria-label", "3D floor plan. Drag to rotate, scroll to zoom, click a table for details.");
    container.appendChild(this.renderer.domElement);

    this.labels = new CSS2DRenderer();
    this.labels.domElement.style.position = "absolute";
    this.labels.domElement.style.inset = "0";
    this.labels.domElement.style.pointerEvents = "none";
    container.appendChild(this.labels.domElement);

    this.camera = new THREE.PerspectiveCamera(38, 1, 0.1, 400);
    this.controls = new OrbitControls(this.camera, this.renderer.domElement);
    this.controls.enableDamping = true;
    this.controls.dampingFactor = 0.09;
    this.controls.screenSpacePanning = false;
    this.controls.maxPolarAngle = Math.PI * 0.46;
    this.controls.minDistance = 2.5;
    this.controls.addEventListener("change", () => {
      this.clampTarget();
      this.dirty = true;
    });

    this.hemi = new THREE.HemisphereLight("#ffffff", "#d8d2c4", 1.9);
    this.scene.add(this.hemi);
    this.sun = new THREE.DirectionalLight("#fff6ec", 1.7);
    this.applyLights();
    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target);

    const el = this.renderer.domElement;
    el.addEventListener("pointerdown", this.onPointerDown);
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerup", this.onPointerUp);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("contextmenu", (e) => e.preventDefault());

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.renderer.setAnimationLoop(this.tick);
  }

  // ─── public API ──────────────────────────────────────────────────────

  /** Switch the scene between the light and dark palette (rebuilds the models, keeps the camera). */
  setTheme(dark: boolean) {
    if (dark === this.dark) return;
    this.dark = dark;
    setPalette(dark);
    this.applyLights();
    if (this.lastLayout) this.setLayout(this.lastLayout.objects, this.lastLayout.width, this.lastLayout.depth);
    this.dirty = true;
  }

  private applyLights() {
    if (this.dark) {
      this.hemi.color.set("#e9e4ff");
      this.hemi.groundColor.set("#2a2420");
      this.hemi.intensity = 1.35;
      this.sun.color.set("#ffd9b0");
      this.sun.intensity = 1.25;
    } else {
      this.hemi.color.set("#ffffff");
      this.hemi.groundColor.set("#d8d2c4");
      this.hemi.intensity = 1.9;
      this.sun.color.set("#fff6ec");
      this.sun.intensity = 1.7;
    }
  }

  setLayout(objects: FloorObjectData[], width: number, depth: number) {
    this.lastLayout = { objects, width, depth };
    const sizeChanged = width !== this.width || depth !== this.depth;
    this.width = width;
    this.depth = depth;
    for (const e of this.entries.values()) {
      e.group.remove(e.label);
      e.label.element.remove();
      this.scene.remove(e.group);
      disposeTree(e.group);
    }
    this.entries.clear();
    this.selection = null;
    if (this.room) {
      this.scene.remove(this.room);
      disposeTree(this.room);
    }
    this.room = buildRoom(width, depth, objects, this.kit).room;
    this.scene.add(this.room);
    this.updateGrid();

    for (const o of objects) {
      const b = buildObject(o, this.kit);
      const { label, main, sub, dot } = this.makeLabel(b);
      b.group.add(label);
      this.scene.add(b.group);
      this.entries.set(o.id, { ...b, label, labelMain: main, labelSub: sub, labelDot: dot, overdue: false, color: "" });
    }
    this.pickables = [...this.entries.values()].flatMap((e) => e.pickables);

    const s = Math.max(width, depth);
    this.sun.position.set(s * 0.35, s * 1.1, s * 0.55);
    const cam = this.sun.shadow.camera;
    cam.left = cam.bottom = -s * 0.75;
    cam.right = cam.top = s * 0.75;
    cam.near = 0.5;
    cam.far = s * 3;
    cam.updateProjectionMatrix();
    this.controls.maxDistance = s * 2.6;

    if (!this.hasLayout || sizeChanged) this.resetView();
    this.hasLayout = true;
    this.applyMode();
    this.updateStatuses();
    this.applySelection();
    this.dirty = true;
  }

  setOrders(orders: FloorOrder[], alertMinutes: number, serverNow: string) {
    this.orders = orders;
    this.alertMinutes = alertMinutes;
    this.clockOffset = Date.parse(serverNow) - Date.now();
    this.updateStatuses();
  }

  setMode(mode: "view" | "edit") {
    this.mode = mode;
    this.applyMode();
  }

  setSelected(id: string | null) {
    this.selectedId = id;
    this.applySelection();
  }

  zoom(factor: number) {
    const offset = this.camera.position.clone().sub(this.controls.target).multiplyScalar(factor);
    const len = THREE.MathUtils.clamp(offset.length(), this.controls.minDistance, this.controls.maxDistance);
    this.camera.position.copy(this.controls.target).add(offset.setLength(len));
    this.controls.update();
    this.dirty = true;
  }

  resetView() {
    const v = this.fitView(THREE.MathUtils.degToRad(52));
    this.flyTo(v.target, v.position, !this.hasLayout);
  }

  topView() {
    const v = this.fitView(THREE.MathUtils.degToRad(89));
    this.flyTo(v.target, v.position);
  }

  /** Camera position that fits the whole floor in view at the given elevation, for the current aspect ratio. */
  private fitView(elevation: number) {
    const corners: THREE.Vector3[] = [];
    for (const x of [-this.width / 2 - 0.15, this.width / 2 + 0.15])
      for (const z of [-this.depth / 2 - 0.15, this.depth / 2 + 0.15]) for (const y of [0, 0.9]) corners.push(new THREE.Vector3(x, y, z));
    const cam = this.camera.clone();
    const dir = new THREE.Vector3(0, Math.sin(elevation), Math.cos(elevation));
    const v = new THREE.Vector3();
    const extents = (target: THREE.Vector3, dist: number) => {
      cam.position.copy(target).addScaledVector(dir, dist);
      cam.lookAt(target);
      cam.updateMatrixWorld();
      let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
      for (const c of corners) {
        v.copy(c).project(cam);
        minX = Math.min(minX, v.x);
        maxX = Math.max(maxX, v.x);
        minY = Math.min(minY, v.y);
        maxY = Math.max(maxY, v.y);
      }
      return { minX, maxX, minY, maxY };
    };
    const fitDistance = (target: THREE.Vector3) => {
      let lo = 1, hi = 400;
      for (let i = 0; i < 40; i++) {
        const mid = (lo + hi) / 2;
        const e = extents(target, mid);
        if (Math.max(-e.minX, e.maxX, -e.minY, e.maxY) > 0.9) lo = mid;
        else hi = mid;
      }
      return hi;
    };
    const target = new THREE.Vector3();
    let dist = fitDistance(target);
    // Centre the floor vertically by sliding the target along z, then refit.
    const centreY = (tz: number) => {
      const e = extents(new THREE.Vector3(0, 0, tz), dist);
      return (e.minY + e.maxY) / 2;
    };
    let lo = -this.depth / 2, hi = this.depth / 2;
    if (Math.sign(centreY(lo)) !== Math.sign(centreY(hi))) {
      for (let i = 0; i < 30; i++) {
        const mid = (lo + hi) / 2;
        if (Math.sign(centreY(mid)) === Math.sign(centreY(lo))) lo = mid;
        else hi = mid;
      }
      target.z = (lo + hi) / 2;
      dist = fitDistance(target);
    }
    return { target, position: target.clone().addScaledVector(dir, dist) };
  }

  focus(id: string) {
    const e = this.entries.get(id);
    if (!e) return;
    const target = new THREE.Vector3(e.group.position.x, 0, e.group.position.z);
    const dir = this.camera.position.clone().sub(this.controls.target);
    const len = Math.min(dir.length(), Math.max(9, Math.max(this.width, this.depth) * 0.75));
    this.flyTo(target, target.clone().add(dir.setLength(len)));
  }

  dispose() {
    this.disposed = true;
    this.renderer.setAnimationLoop(null);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointerdown", this.onPointerDown);
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerup", this.onPointerUp);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    this.controls.dispose();
    for (const e of this.entries.values()) e.label.element.remove();
    disposeTree(this.scene);
    this.kit.dispose();
    this.renderer.dispose();
    el.remove();
    this.labels.domElement.remove();
  }

  // ─── internals ───────────────────────────────────────────────────────

  private tick = (time: number) => {
    if (this.disposed || document.hidden) return;
    if (this.fly) {
      const t = Math.min(1, (time - this.fly.t0) / 450);
      const k = t * t * (3 - 2 * t);
      this.controls.target.lerpVectors(this.fly.from, this.fly.to, k);
      this.camera.position.lerpVectors(this.fly.camFrom, this.fly.camTo, k);
      if (t >= 1) this.fly = null;
      this.dirty = true;
    }
    if (this.controls.update()) this.dirty = true;
    if (time - this.lastStatus > 1000) {
      this.lastStatus = time;
      this.updateStatuses();
      if (this.selectedId && this.mode === "view") this.dirty = true; // keep the tooltip placed as its content changes
    }
    if (this.anyOverdue && this.mode === "view") {
      // Gentle pulse on overdue tables only.
      const pulse = 0.18 + 0.22 * (0.5 + 0.5 * Math.sin(time / 280));
      for (const e of this.entries.values()) {
        if (!e.overdue) continue;
        for (const m of e.primary) m.emissiveIntensity = pulse;
        for (const m of e.secondary) m.emissiveIntensity = pulse * 0.6;
      }
      this.dirty = true;
    }
    if (!this.dirty) return;
    this.dirty = false;
    this.renderer.render(this.scene, this.camera);
    this.labels.render(this.scene, this.camera);
    this.positionTooltip();
  };

  private resize() {
    const first = this.camera.aspect === 1 && !this.hasLayout;
    const w = Math.max(1, this.container.clientWidth);
    const h = Math.max(1, this.container.clientHeight);
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = `${w}px`;
    this.renderer.domElement.style.height = `${h}px`;
    this.labels.setSize(w, h);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
    if (first) return;
    this.dirty = true;
  }

  private flyTo(target: THREE.Vector3, cam: THREE.Vector3, instant = false) {
    if (instant) {
      this.controls.target.copy(target);
      this.camera.position.copy(cam);
      this.controls.update();
      this.dirty = true;
      return;
    }
    this.fly = { t0: performance.now(), from: this.controls.target.clone(), to: target, camFrom: this.camera.position.clone(), camTo: cam };
  }

  private clampTarget() {
    const t = this.controls.target;
    t.x = THREE.MathUtils.clamp(t.x, -this.width / 2, this.width / 2);
    t.z = THREE.MathUtils.clamp(t.z, -this.depth / 2, this.depth / 2);
    t.y = 0;
  }

  private updateGrid() {
    if (this.grid) {
      this.scene.remove(this.grid);
      this.grid.geometry.dispose();
      (this.grid.material as THREE.Material).dispose();
    }
    // 0.5 m grid covering exactly the floor (stronger line every metre).
    const pts: number[] = [];
    const colors: number[] = [];
    const major = new THREE.Color(PALETTE.gridMajor);
    const minor = new THREE.Color(PALETTE.gridMinor);
    const hw = this.width / 2;
    const hd = this.depth / 2;
    const line = (x1: number, z1: number, x2: number, z2: number, c: THREE.Color) => {
      pts.push(x1, 0, z1, x2, 0, z2);
      colors.push(c.r, c.g, c.b, c.r, c.g, c.b);
    };
    for (let x = 0; x <= hw + 1e-6; x += 0.5) {
      const c = Math.abs(x % 1) < 1e-6 ? major : minor;
      line(x, -hd, x, hd, c);
      if (x > 0) line(-x, -hd, -x, hd, c);
    }
    for (let z = 0; z <= hd + 1e-6; z += 0.5) {
      const c = Math.abs(z % 1) < 1e-6 ? major : minor;
      line(-hw, z, hw, z, c);
      if (z > 0) line(-hw, -z, hw, -z, c);
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.Float32BufferAttribute(pts, 3));
    geo.setAttribute("color", new THREE.Float32BufferAttribute(colors, 3));
    this.grid = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ vertexColors: true }));
    this.grid.position.y = 0.006;
    this.grid.visible = this.mode === "edit";
    this.scene.add(this.grid);
  }

  private applyMode() {
    if (this.grid) this.grid.visible = this.mode === "edit";
    for (const e of this.entries.values()) {
      e.label.visible = this.mode === "edit" || ALWAYS_LABELLED.has(e.data.kind);
      if (this.mode === "edit") {
        for (const m of [...e.primary, ...e.secondary]) m.emissiveIntensity = 0;
      }
    }
    this.renderer.domElement.style.cursor = this.mode === "edit" ? "grab" : "default";
    this.dirty = true;
  }

  private applySelection() {
    if (this.selection) {
      this.selection.parent?.remove(this.selection);
      disposeTree(this.selection);
      this.selection = null;
    }
    const e = this.selectedId ? this.entries.get(this.selectedId) : null;
    if (e) {
      this.selection = buildSelection(e, this.kit);
      e.group.add(this.selection);
    }
    const tip = this.cb.tooltip();
    if (tip && !e) tip.style.visibility = "hidden";
    this.dirty = true;
  }

  private positionTooltip() {
    const tip = this.cb.tooltip();
    if (!tip) return;
    const e = this.selectedId ? this.entries.get(this.selectedId) : null;
    if (!e || this.mode !== "view") {
      tip.style.visibility = "hidden";
      return;
    }
    const w = this.container.clientWidth;
    const h = this.container.clientHeight;
    const inner = tip.firstElementChild as HTMLElement | null;
    const tw = inner?.offsetWidth ?? 300;
    const th = inner?.offsetHeight ?? 0;
    const top = new THREE.Vector3(e.group.position.x, e.anchorY + 0.25, e.group.position.z).project(this.camera);
    const x = THREE.MathUtils.clamp(((top.x + 1) / 2) * w, tw / 2 + 8, Math.max(tw / 2 + 8, w - tw / 2 - 8));
    let y = ((1 - top.y) / 2) * h;
    // Not enough room above the object: show the card below it instead.
    const below = y - th < 8;
    if (below) {
      const base = new THREE.Vector3(e.group.position.x, 0, e.group.position.z).project(this.camera);
      y = Math.min(((1 - base.y) / 2) * h + 10, Math.max(8, h - th - 8));
    }
    if (inner) inner.style.transform = below ? "translate(-50%, 0)" : "translate(-50%, calc(-100% - 8px))";
    tip.style.transform = `translate(${x}px, ${y}px)`;
    tip.style.visibility = top.z < 1 ? "visible" : "hidden";
  }

  private makeLabel(b: BuiltObject) {
    const el = document.createElement("div");
    const isTable = b.data.kind === "TABLE";
    el.className = isTable
      ? "flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-white/90 px-2 py-0.5 text-[12px] font-semibold text-ink shadow-[0_4px_12px_-4px_rgb(0_0_0/0.25)] backdrop-blur-md tabular select-none dark:bg-[#2c2c2e]/85"
      : "flex items-center gap-1 whitespace-nowrap rounded-full bg-white/75 px-2 py-px text-[11px] font-medium text-muted backdrop-blur-md select-none dark:bg-[#2c2c2e]/70";
    const dot = document.createElement("span");
    dot.className = "inline-block size-2 rounded-full";
    dot.style.display = isTable || b.data.kind === "PASS" ? "inline-block" : "none";
    const main = document.createElement("span");
    main.textContent = isTable ? (b.data.tableNumber ?? b.data.label) : b.data.label;
    const sub = document.createElement("span");
    sub.className = "font-normal text-muted";
    el.append(dot, main, sub);
    const label = new CSS2DObject(el);
    label.position.set(0, b.anchorY, 0);
    label.center.set(0.5, 1);
    return { label, main, sub, dot };
  }

  private updateStatuses() {
    if (!this.entries.size) return;
    const now = Date.now() + this.clockOffset;
    const objects = [...this.entries.values()].map((e) => e.data);
    const st = computeFloorStatus(objects, this.orders, now, this.alertMinutes);
    let anyOverdue = false;
    for (const e of this.entries.values()) {
      if (e.data.kind !== "TABLE" && e.data.kind !== "PASS") continue;
      const s = st.byObject.get(e.data.id);
      const heat = s?.heat ?? null;
      const color = e.data.kind === "PASS" && heat === null ? PALETTE.stainless : heatColor(heat);
      const overdue = heat !== null && heat >= 1;
      if (color !== e.color || overdue !== e.overdue) {
        e.color = color;
        e.overdue = overdue;
        for (const m of e.primary) {
          m.color.set(color);
          m.emissive.set(overdue ? color : "#000000");
          m.emissiveIntensity = 0;
        }
        const light = tint(color, heat === null ? 0.35 : 0.3);
        for (const m of e.secondary) {
          m.color.set(light);
          m.emissive.set(overdue ? color : "#000000");
          m.emissiveIntensity = 0;
        }
        this.dirty = true;
      }
      anyOverdue ||= overdue;
      e.labelDot.style.background = heat === null && e.data.kind === "PASS" ? "#9AA1A7" : color;
      const sub =
        e.data.kind === "TABLE"
          ? s?.oldestMs != null
            ? formatAge(s.oldestMs)
            : ""
          : s && s.orders.length
            ? `${s.orders.length} waiting · ${formatAge(s.oldestMs ?? 0)}`
            : "";
      if (e.labelSub.textContent !== sub) {
        e.labelSub.textContent = sub;
        e.labelSub.style.color = overdue ? "var(--danger)" : "";
        this.dirty = true;
      }
    }
    if (this.anyOverdue && !anyOverdue) {
      for (const e of this.entries.values()) for (const m of [...e.primary, ...e.secondary]) m.emissiveIntensity = 0;
      this.dirty = true;
    }
    this.anyOverdue = anyOverdue;
  }

  private setPointer(ev: PointerEvent) {
    const r = this.renderer.domElement.getBoundingClientRect();
    this.ndc.set(((ev.clientX - r.left) / r.width) * 2 - 1, -((ev.clientY - r.top) / r.height) * 2 + 1);
    this.raycaster.setFromCamera(this.ndc, this.camera);
  }

  private pick(ev: PointerEvent): Entry | null {
    this.setPointer(ev);
    const hit = this.raycaster.intersectObjects(this.pickables, false)[0];
    const id = hit?.object.userData.objectId as string | undefined;
    return id ? (this.entries.get(id) ?? null) : null;
  }

  private floorPoint(ev: PointerEvent) {
    this.setPointer(ev);
    const p = new THREE.Vector3();
    return this.raycaster.ray.intersectPlane(this.floorPlane, p) ? p : null;
  }

  private onPointerDown = (ev: PointerEvent) => {
    if (ev.button !== 0) return;
    const entry = this.pick(ev);
    this.down = { x: ev.clientX, y: ev.clientY, id: entry?.data.id ?? null };
    if (this.mode === "edit" && entry) {
      const p = this.floorPoint(ev);
      if (!p) return;
      this.controls.enabled = false;
      this.renderer.domElement.setPointerCapture(ev.pointerId);
      this.renderer.domElement.style.cursor = "grabbing";
      this.drag = { entry, offset: entry.group.position.clone().sub(p), moved: false };
      if (this.selectedId !== entry.data.id) this.cb.onSelect(entry.data.id);
    }
  };

  private onPointerMove = (ev: PointerEvent) => {
    if (this.drag) {
      const p = this.floorPoint(ev);
      if (!p) return;
      const e = this.drag.entry;
      const nx = THREE.MathUtils.clamp(Math.round((p.x + this.drag.offset.x) / SNAP) * SNAP, -this.width / 2, this.width / 2);
      const nz = THREE.MathUtils.clamp(Math.round((p.z + this.drag.offset.z) / SNAP) * SNAP, -this.depth / 2, this.depth / 2);
      if (nx !== e.group.position.x || nz !== e.group.position.z) {
        e.group.position.set(nx, 0, nz);
        this.drag.moved = true;
        this.dirty = true;
      }
      return;
    }
    if (ev.buttons) return;
    const entry = this.pick(ev);
    const cursor = entry ? (this.mode === "edit" ? "grab" : "pointer") : this.mode === "edit" ? "default" : "default";
    if (this.renderer.domElement.style.cursor !== cursor) this.renderer.domElement.style.cursor = cursor;
  };

  private onPointerUp = (ev: PointerEvent) => {
    if (this.drag) {
      const { entry, moved } = this.drag;
      this.drag = null;
      this.controls.enabled = true;
      this.renderer.domElement.style.cursor = "grab";
      if (this.renderer.domElement.hasPointerCapture(ev.pointerId)) this.renderer.domElement.releasePointerCapture(ev.pointerId);
      if (moved) {
        const x = Math.round(entry.group.position.x * 100) / 100;
        const z = Math.round(entry.group.position.z * 100) / 100;
        this.cb.onMove(entry.data.id, x, z);
      }
      this.down = null;
      return;
    }
    const d = this.down;
    this.down = null;
    if (!d || ev.button !== 0) return;
    if (Math.hypot(ev.clientX - d.x, ev.clientY - d.y) > 6) return; // it was a camera drag
    this.cb.onSelect(d.id);
  };

  private onPointerLeave = () => {
    if (!this.drag) this.renderer.domElement.style.cursor = this.mode === "edit" ? "grab" : "default";
  };
}
