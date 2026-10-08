// 普通教室棟と講堂の3Dモデル、および展示間の最短経路。
// パンフレットの平面図と学校公式サイトの写真から起こした模式図で、実測図ではない。
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ---- 寸法 (m) ------------------------------------------------------------
// ponytail: 寸法の公表値がないので、普通教室の一般的な大きさから置いた概算。
// 実寸が分かったらここだけ直せば全体が追従する。
export const GEOM = {
  CW: 7,      // 教室の間口（廊下に沿う向き）
  CD: 9,      // 教室の奥行き
  COR: 2.6,   // 廊下の幅
  FH: 3.9,    // 階高
  GAP: 0.55,  // 教室どうしの壁
  FLOORS: 4,
};
const { CW, CD, COR, FH, GAP } = GEOM;
const IN0 = CD + COR;              // 11.6  中庭の内側が始まる位置
const SPAN = 4 * CW;               // 28    中庭の一辺
const OUT = IN0 + SPAN + COR + CD; // 51.2  ロの字の外形
const MID = OUT / 2;
const TOP = GEOM.FLOORS * FH;

// 廊下の中心線
const COR_N = CD + COR / 2;
const COR_S = OUT - CD - COR / 2;
const COR_W = COR_N;
const COR_E = COR_S;

// ロの字から張り出す部分。これがあるので外形は単純な矩形にならない
const STUB = { x: IN0 + 2 * CW, z: -(CD + COR), w: 2 * CW, d: CD };  // 北へ
const NECK = { x: IN0 + 2.6 * CW, z: -COR, w: CW * 0.8, d: COR };    // 北の渡り
const ANNEX = { x: OUT + COR, z: IN0, w: CD, d: 2 * CW };            // 東へ

// 講堂。学校サイトに「2階席を含め約1500名収容」とある。内部に床を持たない1室として置く
const HALL = { x: OUT + 7, z: 8, w: 29, d: 35, h: FH * 3.2 };

// 塔屋。中庭の写真にある車寄せの上の塔。位置は写真から目分量で置いた
const TOWER = { w: 5.2, d: 4.4, h: TOP + 7.5 };

// ---- 平面上の矩形 --------------------------------------------------------
export function roomRect(wing, i) {
  switch (wing) {
    case 'north':      return { x: IN0 + i * CW, z: 0,            w: CW, d: CD };
    case 'south':      return { x: IN0 + i * CW, z: OUT - CD,     w: CW, d: CD };
    case 'west':       return { x: 0,            z: IN0 + i * CW, w: CD, d: CW };
    case 'east':       return { x: OUT - CD,     z: IN0 + i * CW, w: CD, d: CW };
    case 'north_stub': return { x: STUB.x + i * CW, z: STUB.z,    w: CW, d: CD };
    case 'east_annex': return { x: ANNEX.x, z: ANNEX.z + i * CW,  w: CD, d: CW };
    default:           return null;
  }
}

// 教室が中庭を向く面。窓の桟をここに描く
function innerFace(wing) {
  return { north: '+z', south: '-z', west: '+x', east: '-x', north_stub: '+z', east_annex: '-x' }[wing] || '+z';
}

function doorPoint(wing, i) {
  const r = roomRect(wing, i);
  switch (wing) {
    case 'north':      return [r.x + r.w / 2, COR_N];
    case 'south':      return [r.x + r.w / 2, COR_S];
    case 'west':       return [COR_W, r.z + r.d / 2];
    case 'east':       return [COR_E, r.z + r.d / 2];
    case 'north_stub': return [r.x + r.w / 2, COR_N];
    case 'east_annex': return [COR_E, r.z + r.d / 2];
    default:           return [MID, MID];
  }
}

// ---- 経路のグラフ --------------------------------------------------------
const CORNERS = {
  NW: [COR_W, COR_N], NE: [COR_E, COR_N],
  SE: [COR_E, COR_S], SW: [COR_W, COR_S],
};
const STAIR_AT = ['NW', 'NE', 'SE', 'SW'];
const EV_AT = 'SE';      // EVは南東。1階で正門につながる
const EV_OFFSET = 4.2;   // 南東の角の階段から離した位置
const STAIR_SIZE = 4.6;  // 図示する階段室の一辺
const EV_SIZE = 3.2;

// ponytail: 混雑時の待ち時間を実測していないので置いた値。EVを階段より重くして、
// 普段は階段、車いす等では「階段を使わない」を選ぶ、という使い分けにしている。
const STAIR_COST = FH * 3.0;
const EV_COST = FH * 7.0;

export function buildGraph(floors) {
  const nodes = new Map();
  const edges = new Map();
  const add = (id, x, z, f, kind, label) => {
    nodes.set(id, { id, x, z, f, kind, label });
    if (!edges.has(id)) edges.set(id, []);
  };
  const link = (a, b, w, type = 'walk') => {
    if (!nodes.has(a) || !nodes.has(b)) return;
    edges.get(a).push({ to: b, w, type });
    edges.get(b).push({ to: a, w, type });
  };
  const dist = (a, b) => Math.hypot(nodes.get(a).x - nodes.get(b).x, nodes.get(a).z - nodes.get(b).z);

  for (let f = 1; f <= GEOM.FLOORS; f++) {
    for (const [k, [x, z]] of Object.entries(CORNERS)) add(`c${f}:${k}`, x, z, f, 'corner', k);

    const data = floors[f];
    const byWing = { north: [], south: [], west: [], east: [], north_stub: [], east_annex: [] };
    for (const r of (data ? data.rooms : [])) if (byWing[r.wing]) byWing[r.wing].push(r);
    for (const list of Object.values(byWing)) list.sort((a, b) => a.indexInWing - b.indexInWing);

    const run = (wing, from, to, reverse) => {
      const list = reverse ? [...byWing[wing]].reverse() : byWing[wing];
      let prev = `c${f}:${from}`;
      for (const r of list) {
        const [x, z] = doorPoint(wing, r.indexInWing);
        const door = `d${f}:${r.room}`;
        add(door, x, z, f, 'corridor', r.room);
        link(prev, door, dist(prev, door));
        const rect = roomRect(wing, r.indexInWing);
        add(`r${f}:${r.room}`, rect.x + rect.w / 2, rect.z + rect.d / 2, f, 'room', r.room);
        link(door, `r${f}:${r.room}`, dist(door, `r${f}:${r.room}`));
        prev = door;
      }
      link(prev, `c${f}:${to}`, dist(prev, `c${f}:${to}`));
    };
    run('north', 'NW', 'NE', false);
    run('east', 'NE', 'SE', false);
    run('south', 'SE', 'SW', true);
    run('west', 'SW', 'NW', true);

    for (const wing of ['north_stub', 'east_annex']) {
      for (const r of byWing[wing]) {
        const [x, z] = doorPoint(wing, r.indexInWing);
        const door = `d${f}:${r.room}`;
        add(door, x, z, f, 'corridor', r.room);
        const rect = roomRect(wing, r.indexInWing);
        add(`r${f}:${r.room}`, rect.x + rect.w / 2, rect.z + rect.d / 2, f, 'room', r.room);
        link(door, `r${f}:${r.room}`, dist(door, `r${f}:${r.room}`) + 4);
        const near = wing === 'north_stub' ? `c${f}:NE` : `c${f}:SE`;
        link(door, near, dist(door, near));
      }
    }

    // EVは角とは別のノードにする。こうしないと階段と見分けがつかない
    const [ex, ez] = CORNERS[EV_AT];
    add(`ev${f}`, ex + EV_OFFSET, ez + EV_OFFSET, f, 'ev', 'EV');
    link(`ev${f}`, `c${f}:${EV_AT}`, 3);

    if (f > 1) {
      for (const k of STAIR_AT) link(`c${f - 1}:${k}`, `c${f}:${k}`, STAIR_COST, 'stair');
      link(`ev${f - 1}`, `ev${f}`, EV_COST, 'ev');
    }
  }

  add('gate', COR_E + 11, COR_S + 10, 1, 'gate', '正門');
  link('gate', 'ev1', 9);

  return { nodes, edges };
}

export function shortestPath(graph, from, to, opt = {}) {
  const { nodes, edges } = graph;
  if (!nodes.has(from) || !nodes.has(to)) return null;
  const d = new Map([[from, 0]]);
  const prev = new Map();
  const seen = new Set();
  // ponytail: ノードは300程度なので線形探索で足りる。優先度付きキューは不要。
  for (;;) {
    let u = null, best = Infinity;
    for (const [id, v] of d) if (!seen.has(id) && v < best) { best = v; u = id; }
    if (u === null) return null;
    if (u === to) break;
    seen.add(u);
    for (const e of edges.get(u) || []) {
      if (seen.has(e.to)) continue;
      if (opt.noStairs && e.type === 'stair') continue;
      const nd = best + e.w;
      if (nd < (d.get(e.to) ?? Infinity)) { d.set(e.to, nd); prev.set(e.to, u); }
    }
  }
  const path = [to];
  while (path[0] !== from) path.unshift(prev.get(path[0]));
  return { path: path.map((id) => nodes.get(id)), cost: d.get(to) };
}

const cornerName = (k) => ({ NW: '北西', NE: '北東', SE: '南東', SW: '南西' }[k] || k);

// 経路を人が読める道順にする。曲がり角と、途中で通る展示を目印にする。
// 階をまたぐ区間は、連続していればまとめて1行にする。
export function describePath(path, nameOf) {
  const out = [];
  if (!path || path.length < 2) return out;

  const endRooms = new Set([path[0].label, path[path.length - 1].label]);
  const text = (n) => {
    const nm = nameOf ? nameOf(n.label, n.f) : '';
    return nm ? `${n.label} ${nm}` : String(n.label);
  };

  out.push(`${text(path[0])}（${path[0].f}階）を出る`);

  let i = 1;
  while (i < path.length) {
    // 階をまたぐ区間。同じ手段で続く限りまとめる
    if (path[i].f !== path[i - 1].f) {
      const byEv = path[i].kind === 'ev' && path[i - 1].kind === 'ev';
      const from = path[i - 1].f;
      let k = i;
      while (k + 1 < path.length && path[k + 1].f !== path[k].f && path[k + 1].kind === path[k].kind) k++;
      const where = byEv ? '南東' : cornerName(path[k].label);
      const dir = path[k].f > from ? '上がる' : '下りる';
      out.push(`${where}の${byEv ? 'エレベーター' : '階段'}で ${from}階から${path[k].f}階へ${dir}`);
      i = k + 1;
      continue;
    }

    // 同じ階を歩く区間をまとめ、曲がり角と目印を1行で出す
    let j = i;
    while (j + 1 < path.length && path[j + 1].f === path[j].f) j++;
    const run = path.slice(i - 1, j + 1);
    // 区間の端の角は、階段の上り口か下り口なので「曲がる」には数えない
    const inner = run.slice(1, -1);
    const corners = inner.filter((n) => n.kind === 'corner').map((n) => cornerName(n.label));
    const marks = inner.filter((n) => n.kind === 'corridor' && !endRooms.has(n.label));
    const mark = marks.length ? marks[Math.floor(marks.length / 2)] : null;

    if (corners.length) {
      const turn = `${corners.join('と')}の角を曲がる`;
      out.push(mark ? `${text(mark)}の方面へ進み、${turn}` : `廊下を進み、${turn}`);
    } else if (mark) {
      out.push(`${text(mark)}の方面へ廊下を進む`);
    }
    i = j + 1;
  }

  const goal = path[path.length - 1];
  out.push(`${text(goal)}（${goal.f}階）に到着`);
  return out;
}

// 実際に歩く長さ。階段は上り下りの分を足し、EVに乗っている間は歩数に数えない
export function pathLength(steps) {
  let d = 0;
  for (let i = 1; i < steps.length; i++) {
    const a = steps[i - 1], b = steps[i];
    d += Math.hypot(b.x - a.x, b.z - a.z);
    if (a.f !== b.f && !(a.kind === 'ev' && b.kind === 'ev')) d += Math.abs(b.f - a.f) * FH * 2.4;
  }
  return d;
}

// ---- 3D ------------------------------------------------------------------
const INK = 0x1d1d1f;
const RED = 0xff3b30;
const BLUE  = 0x0071e3;
const GREEN = 0x34c759;  // 目的地
const AMBER = 0xf5b301;  // 階段とエレベーター

export function createScene(canvas, floors, onPick) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));

  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 1, 2000);

  const controls = new OrbitControls(camera, canvas);
  controls.enableDamping = true;
  controls.maxPolarAngle = Math.PI * 0.495;
  controls.minDistance = 30;
  controls.maxDistance = 400;
  controls.target.set(MID + 5, TOP * 0.35, MID);
  camera.position.set(MID + 42, 64, MID + 62);

  const world = new THREE.Group();
  scene.add(world);

  const mat = {
    shell: new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.5 }),
    slab:  new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.26 }),
    sash:  new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.17 }),
    hall:  new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.3 }),
    route: new THREE.LineBasicMaterial({ color: BLUE, transparent: true, depthTest: false }),
  };
  const roomFace = () => new THREE.MeshBasicMaterial({
    color: INK, transparent: true, opacity: 0.05, depthWrite: false, side: THREE.DoubleSide,
  });
  const roomEdge = () => new THREE.LineBasicMaterial({ color: INK, transparent: true, opacity: 0.22 });

  const V = (x, y, z) => new THREE.Vector3(x, y, z);
  const seg = (pts, m) => new THREE.LineSegments(new THREE.BufferGeometry().setFromPoints(pts), m);
  const loop = (pts, m) => new THREE.Line(new THREE.BufferGeometry().setFromPoints([...pts, pts[0]]), m);
  const rectPts = (r, y) => [V(r.x, y, r.z), V(r.x + r.w, y, r.z), V(r.x + r.w, y, r.z + r.d), V(r.x, y, r.z + r.d)];

  const floorGroups = [];
  const roomMeshes = [];

  for (let f = 1; f <= GEOM.FLOORS; f++) {
    const g = new THREE.Group();
    const y = (f - 1) * FH;

    // 床。ロの字に加えて北の張り出しと東の別棟があるので、外形は矩形にならない
    g.add(loop(rectPts({ x: 0, z: 0, w: OUT, d: OUT }, y), mat.slab));
    g.add(loop(rectPts({ x: IN0, z: IN0, w: SPAN, d: SPAN }, y), mat.slab));
    g.add(loop(rectPts(STUB, y), mat.slab));
    g.add(loop(rectPts(NECK, y), mat.slab));
    g.add(loop(rectPts(ANNEX, y), mat.slab));

    const data = floors[f];
    const sash = [];
    for (const r of (data ? data.rooms : [])) {
      const rect = roomRect(r.wing, r.indexInWing);
      if (!rect) continue;
      // 教室どうしを壁の分だけ離す
      const w = rect.w - GAP, d = rect.d - GAP, h = FH - 0.5;
      const cx = rect.x + rect.w / 2, cz = rect.z + rect.d / 2, cy = y + h / 2 + 0.25;

      const box = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), roomFace());
      box.position.set(cx, cy, cz);
      box.userData = { room: r.room, floor: f, name: r.name, desc: r.desc };
      g.add(box);
      roomMeshes.push(box);

      const edge = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), roomEdge());
      edge.position.copy(box.position);
      g.add(edge);
      box.userData.edge = edge;

      // 中庭を向く面の窓。学校サイトの中庭の写真にある規則的な窓の列
      const face = innerFace(r.wing);
      const y0 = y + 1.0, y1 = y + h - 0.1, ys = y + 1.9, n = 4;
      if (face === '+z' || face === '-z') {
        const fz = face === '+z' ? cz + d / 2 : cz - d / 2;
        for (let i = 1; i < n; i++) {
          const x = cx - w / 2 + (w * i) / n;
          sash.push(V(x, y0, fz), V(x, y1, fz));
        }
        sash.push(V(cx - w / 2, ys, fz), V(cx + w / 2, ys, fz));
      } else {
        const fx = face === '+x' ? cx + w / 2 : cx - w / 2;
        for (let i = 1; i < n; i++) {
          const z = cz - d / 2 + (d * i) / n;
          sash.push(V(fx, y0, z), V(fx, y1, z));
        }
        sash.push(V(fx, ys, cz - d / 2), V(fx, ys, cz + d / 2));
      }
    }
    if (sash.length) g.add(seg(sash, mat.sash));

    // 階段とEVの領域。経路のグラフと同じ座標から引いているので、経路の線とずれない
    const circ = new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.85 });
    const yy = y + 0.06;
    for (const [cx, cz] of Object.values(CORNERS)) {
      const r = { x: cx - STAIR_SIZE / 2, z: cz - STAIR_SIZE / 2, w: STAIR_SIZE, d: STAIR_SIZE };
      g.add(loop(rectPts(r, yy), circ)).userData.circ = true;
      const steps = [];
      for (let i = 1; i < 5; i++) {
        const sz = r.z + (r.d * i) / 5;
        steps.push(V(r.x + 0.5, yy, sz), V(r.x + r.w - 0.5, yy, sz));
      }
      // 上の階へ向かう1本。段を上がることが分かる
      if (f < GEOM.FLOORS) steps.push(V(r.x + 0.5, yy, r.z + r.d - 0.5), V(r.x + r.w - 0.5, y + FH, r.z + 0.5));
      g.add(seg(steps, circ)).userData.circ = true;
    }
    {
      const ex = COR_E + EV_OFFSET, ez = COR_S + EV_OFFSET;
      const r = { x: ex - EV_SIZE / 2, z: ez - EV_SIZE / 2, w: EV_SIZE, d: EV_SIZE };
      g.add(loop(rectPts(r, yy), circ)).userData.circ = true;
      g.add(loop(rectPts({ x: r.x + 0.6, z: r.z + 0.6, w: EV_SIZE - 1.2, d: EV_SIZE - 1.2 }, yy), circ)).userData.circ = true;
    }

    world.add(g);
    floorGroups.push(g);
  }

  // EVの竪穴。4隅の柱を通して、上下につながっていることを見せる
  {
    const ex = COR_E + EV_OFFSET, ez = COR_S + EV_OFFSET, h = EV_SIZE / 2;
    const p = [];
    for (const [dx, dz] of [[-h, -h], [h, -h], [h, h], [-h, h]]) {
      p.push(V(ex + dx, 0, ez + dz), V(ex + dx, TOP, ez + dz));
    }
    world.add(seg(p, new THREE.LineBasicMaterial({ color: AMBER, transparent: true, opacity: 0.5 })));
  }

  // 正門。1階でEVの前につながる
  {
    const gx = COR_E + 11, gz = COR_S + 10;
    world.add(loop(rectPts({ x: gx - 3, z: gz - 2, w: 6, d: 4 }, 0.06), mat.hall));
    world.add(seg([V(gx, 0.06, gz - 2), V(COR_E + EV_OFFSET, 0.06, COR_S + EV_OFFSET)], mat.hall));
  }

  // 屋上とパラペット
  world.add(loop(rectPts({ x: 0, z: 0, w: OUT, d: OUT }, TOP), mat.shell));
  world.add(loop(rectPts({ x: -0.5, z: -0.5, w: OUT + 1, d: OUT + 1 }, TOP + 0.9), mat.shell));
  world.add(loop(rectPts({ x: IN0, z: IN0, w: SPAN, d: SPAN }, TOP), mat.shell));

  // 外周と中庭の柱
  {
    const p = [];
    for (const [cx, cz] of [[0, 0], [OUT, 0], [OUT, OUT], [0, OUT],
      [IN0, IN0], [IN0 + SPAN, IN0], [IN0 + SPAN, IN0 + SPAN], [IN0, IN0 + SPAN]]) {
      p.push(V(cx, 0, cz), V(cx, TOP, cz));
    }
    world.add(seg(p, mat.shell));
  }

  // 塔屋と星章。中庭に面した車寄せの上に立つ
  {
    const tx = IN0 + SPAN / 2, tz = OUT - CD - COR / 2;
    const t = new THREE.Mesh(
      new THREE.BoxGeometry(TOWER.w, TOWER.h, TOWER.d),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.04, depthWrite: false }),
    );
    t.position.set(tx, TOWER.h / 2, tz);
    world.add(t);
    const te = new THREE.LineSegments(new THREE.EdgesGeometry(t.geometry), mat.shell);
    te.position.copy(t.position);
    world.add(te);

    // 麻布学園の星章を塔屋の中庭側に描く
    const star = [];
    const R = 1.5, r2 = 0.62, sy = TOP + 4.6, sz = tz - TOWER.d / 2 - 0.05;
    for (let i = 0; i < 12; i++) {
      const a = (Math.PI / 6) * i - Math.PI / 2;
      const rad = i % 2 === 0 ? R : r2;
      star.push(V(tx + Math.cos(a) * rad, sy + Math.sin(a) * rad, sz));
    }
    world.add(loop(star, mat.shell));

    // 車寄せの庇
    world.add(loop(rectPts({ x: tx - 4.2, z: tz - 3.4, w: 8.4, d: 3.4 }, 4.2), mat.shell));
  }

  // 講堂
  {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(HALL.w, HALL.h, HALL.d),
      new THREE.MeshBasicMaterial({ color: INK, transparent: true, opacity: 0.03, depthWrite: false }),
    );
    box.position.set(HALL.x + HALL.w / 2, HALL.h / 2, HALL.z + HALL.d / 2);
    world.add(box);
    const e = new THREE.LineSegments(new THREE.EdgesGeometry(box.geometry), mat.hall);
    e.position.copy(box.position);
    world.add(e);
    world.add(seg([V(OUT, 0.1, COR_S), V(HALL.x, 0.1, COR_S), V(OUT, FH, COR_S), V(HALL.x, FH, COR_S)], mat.hall));
  }

  // ---- 操作 ----
  let routeLine = null;
  function drawRoute(steps) {
    if (routeLine) { world.remove(routeLine); routeLine.geometry.dispose(); routeLine = null; }
    if (!steps || steps.length < 2) return;
    const pts = steps.map((n) => V(n.x, (n.f - 1) * FH + 1.3, n.z));
    routeLine = new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), mat.route);
    routeLine.renderOrder = 999;
    world.add(routeLine);
  }

  let marked = [];
  // paint は { "1:100": "red", "4:421": "green" } の形
  function highlight(paint = {}) {
    for (const m of marked) {
      m.material.color.setHex(INK); m.material.opacity = 0.05;
      m.userData.edge.material.color.setHex(INK); m.userData.edge.material.opacity = 0.22;
    }
    marked = roomMeshes.filter((m) => paint[`${m.userData.floor}:${m.userData.room}`]);
    for (const m of marked) {
      const c = paint[`${m.userData.floor}:${m.userData.room}`] === 'green' ? GREEN : RED;
      m.material.color.setHex(c); m.material.opacity = 0.5;
      m.userData.edge.material.color.setHex(c); m.userData.edge.material.opacity = 1;
    }
  }

  function showFloor(f) {
    floorGroups.forEach((g, i) => {
      const lit = f === 0 || i + 1 === f;
      for (const o of g.children) {
        if (!o.material) continue;
        if (o.isMesh) {
          if (!marked.includes(o)) o.material.opacity = lit ? 0.05 : 0.008;
          continue;
        }
        if (o.material === mat.slab || o.material === mat.sash) continue;
        if (marked.some((m) => m.userData.edge === o)) continue;
        if (o.userData.circ) { o.material.opacity = lit ? 0.85 : 0.14; continue; }
        o.material.opacity = lit ? 0.22 : 0.05;
      }
    });
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2();
  let down = null;
  canvas.addEventListener('pointerdown', (e) => { down = [e.clientX, e.clientY]; });
  canvas.addEventListener('pointerup', (e) => {
    if (!down || Math.hypot(e.clientX - down[0], e.clientY - down[1]) > 6) return;
    const r = canvas.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(pointer, camera);
    const hit = ray.intersectObjects(roomMeshes)[0];
    if (hit) onPick(hit.object.userData);
  });

  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // 縦長の画面では視野を広げないと建物が収まらない
    camera.fov = w / h < 1 ? 38 / Math.max(0.5, w / h) : 38;
    camera.updateProjectionMatrix();
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  // 読み込み時の一度きりの動き: 下の階から順に立ち上がる
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let t0 = null;
  if (!reduce) floorGroups.forEach((g, i) => { g.position.y = -(i + 1) * 12; });

  function tick(t) {
    requestAnimationFrame(tick);
    if (!reduce) {
      if (t0 === null) t0 = t;
      const e = (t - t0) / 1000;
      floorGroups.forEach((g, i) => {
        const p = Math.min(1, Math.max(0, (e - i * 0.16) / 0.95));
        g.position.y = -(i + 1) * 12 * (1 - p) ** 3;
      });
    }
    controls.update();
    renderer.render(scene, camera);
  }
  requestAnimationFrame(tick);

  return { drawRoute, highlight, showFloor, camera, controls };
}
