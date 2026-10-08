// 展示と校舎のページ。3Dモデル、展示一覧、最短経路。
import { createScene, buildGraph, shortestPath, describePath, pathLength } from './map3d.js?v=2';
import { $, $$, load } from './site.js?v=2';

const FLOORS = [1, 2, 3, 4];

init().catch((err) => {
  console.error(err);
  $('#result').textContent = `読み込みに失敗しました。${err.message}`;
});

async function init() {
  const [floorList, extras] = await Promise.all([
    Promise.all(FLOORS.map((f) => load(`data/floor${f}.json`))),
    load('data/extras.json'),
  ]);
  const floors = {};
  for (const d of floorList) floors[d.floor] = d;

  // フロンティア展示は展示の名前ではなく、小さな展示が集まる場所の呼び名。
  // 平面図の部屋名のままだと8部屋とも同じ名前になるので、中の展示を出す。
  const inside = new Map();
  for (const x of extras.frontier || []) {
    if (!inside.has(x.room)) inside.set(x.room, []);
    inside.get(x.room).push({ name: x.name, desc: x.desc || '' });
  }

  // 物理的な部屋。3Dと経路はこちらを使う
  const rooms = [];
  for (const f of FLOORS) {
    for (const r of floors[f].rooms) {
      const inner = inside.get(r.room);
      rooms.push({
        room: r.room,
        floor: f,
        space: inner ? r.name : '',
        exhibits: inner || [{ name: r.name, desc: r.desc || '' }],
      });
    }
  }
  rooms.sort((a, b) => a.room.localeCompare(b.room, 'en', { numeric: true }));
  const findRoom = (room, floor) => rooms.find((x) => x.room === room && x.floor === floor);

  // 一覧は展示ごとに1行。1部屋に複数の展示が入ることがある
  const entries = [];
  for (const r of rooms) for (const ex of r.exhibits) entries.push({ ...ex, room: r.room, floor: r.floor, space: r.space });

  const graph = buildGraph(floors);
  const scene = createScene($('#stage'), floors, (d) => openDetail(d.room, d.floor, null));

  renderList(entries);
  $('.title small').textContent = `展示と校舎　普通教室棟と講堂、展示${entries.length}件`;

  $('#q').addEventListener('input', () => {
    const q = $('#q').value.trim().toLowerCase();
    $$('#list li').forEach((li) => { li.hidden = q !== '' && !li.dataset.key.includes(q); });
  });

  $('.panel-toggle').addEventListener('click', () => togglePanel());
  const narrow = matchMedia('(max-width: 820px)').matches;
  togglePanel(!narrow); // 狭い画面では一覧を畳んで3Dに場所を譲る

  $$('.floors button').forEach((b) => b.addEventListener('click', () => {
    $$('.floors button').forEach((o) => o.classList.toggle('on', o === b));
    scene.showFloor(Number(b.dataset.floor));
  }));

  $('#nostairs').addEventListener('change', drawRoute);
  $('#clear').addEventListener('click', () => {
    leg.from = null; leg.to = null;
    paintLegs();
    $('#result').textContent = '';
    scene.drawRoute(null);
    scene.highlight([]);
  });

  function togglePanel(force) {
    const p = $('#panel');
    const open = force ?? p.dataset.open !== 'true';
    p.dataset.open = String(open);
    $('.panel-toggle').setAttribute('aria-expanded', String(open));
  }

  // ---- 展示の説明 ------------------------------------------------------
  function label(room, floor) {
    const r = findRoom(room, floor);
    if (!r) return room;
    return r.space || r.exhibits[0].name;
  }

  function card(r) {
    const el = document.createElement('div');
    el.className = 'detail card';

    const head = document.createElement('div');
    head.className = 'dhead';
    const num = document.createElement('span');
    num.className = 'room disp';
    num.textContent = r.room;
    const nm = document.createElement('span');
    nm.className = 'dname';
    nm.textContent = r.space || r.exhibits[0].name;
    const fl = document.createElement('span');
    fl.className = 'dfl';
    fl.textContent = `${r.floor}階`;
    const x = document.createElement('button');
    x.className = 'x';
    x.type = 'button';
    x.setAttribute('aria-label', '閉じる');
    x.textContent = '×';
    x.addEventListener('click', closeDetail);
    head.append(num, nm, fl, x);

    const body = document.createElement('div');
    body.className = 'dbody';
    const many = r.exhibits.length > 1;
    for (const ex of r.exhibits) {
      const d = document.createElement('div');
      d.className = 'ex';
      if (many) {
        const n = document.createElement('div');
        n.className = 'exn';
        n.textContent = ex.name;
        d.append(n);
      }
      if (ex.desc) {
        const p = document.createElement('p');
        p.className = 'exd';
        p.textContent = ex.desc;
        d.append(p);
      }
      body.append(d);
    }

    const act = document.createElement('div');
    act.className = 'dact';
    for (const [which, text] of [['from', 'ここから出発'], ['to', 'ここへ行く']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = which === 'from' ? 'pill' : 'pill ghost';
      b.textContent = text;
      b.addEventListener('click', () => setLeg(which, r.room, r.floor));
      act.append(b);
    }

    el.append(head, body, act);
    return el;
  }

  function openDetail(room, floor, rowEl) {
    const r = findRoom(room, floor);
    if (!r) return;
    scene.highlight(pickedKeys(`${floor}:${room}`));

    const host = $('#detail');
    const paint = () => {
      host.replaceChildren(card(r));
      host.hidden = false;
    };

    // 一覧の行から説明の位置まで、形を保ったまま動かす。
    // 対応していないブラウザと、タブが裏にあって中断された場合は、そのまま描画する。
    if (!document.startViewTransition || !rowEl || document.visibilityState !== 'visible') { paint(); return; }

    rowEl.style.viewTransitionName = 'pick';
    const update = () => {
      rowEl.style.viewTransitionName = '';
      paint();
      host.firstElementChild.style.viewTransitionName = 'pick';
    };
    const cleanup = () => {
      const c = host.firstElementChild;
      if (c) c.style.viewTransitionName = '';
      rowEl.style.viewTransitionName = '';
    };

    let t;
    try { t = document.startViewTransition({ update, types: ['pick'] }); }
    catch { try { t = document.startViewTransition(update); } catch { paint(); return; } }

    t.updateCallbackDone.catch(() => { paint(); });
    t.finished.catch(() => {}).finally(cleanup);
  }

  function closeDetail() {
    $('#detail').hidden = true;
    $('#detail').replaceChildren();
    scene.highlight(pickedKeys(null));
  }

  // ---- 経路 ------------------------------------------------------------
  const leg = { from: null, to: null };

  function pickedKeys(extra) {
    const keys = [];
    for (const v of [leg.from, leg.to]) if (v) keys.push(`${v.floor}:${v.room}`);
    if (extra) keys.push(extra);
    return keys;
  }

  function setLeg(which, room, floor) {
    leg[which] = { room, floor };
    const other = which === 'from' ? 'to' : 'from';
    // 同じ部屋を両方に入れない
    if (leg[other] && leg[other].room === room && leg[other].floor === floor) leg[other] = null;
    paintLegs();
    drawRoute();
  }

  function paintLegs() {
    for (const which of ['from', 'to']) {
      const el = $(`#leg-${which}`);
      const v = leg[which];
      el.textContent = v ? `${v.room} ${label(v.room, v.floor)}` : '未選択';
      el.classList.toggle('empty', !v);
    }
    $('#clear').hidden = !leg.from && !leg.to;
  }

  function drawRoute() {
    const out = $('#result');
    out.textContent = '';
    scene.highlight(pickedKeys(null));
    if (!leg.from || !leg.to) { scene.drawRoute(null); return; }

    const a = `r${leg.from.floor}:${leg.from.room}`;
    const b = `r${leg.to.floor}:${leg.to.room}`;
    const res = shortestPath(graph, a, b, { noStairs: $('#nostairs').checked });
    if (!res) {
      scene.drawRoute(null);
      out.textContent = '経路が見つかりません。階段を使わない条件を外すと出る場合があります。';
      return;
    }

    scene.drawRoute(res.path);
    const sum = document.createElement('div');
    sum.className = 'sum';
    sum.textContent = `歩く距離 およそ ${Math.round(pathLength(res.path) / 5) * 5} m`;
    out.append(sum);
    const steps = describePath(res.path);
    for (const s of steps.length ? steps : ['同じ階です。廊下をそのまま進みます。']) {
      const d = document.createElement('div');
      d.className = 'step';
      d.textContent = s;
      out.append(d);
    }
  }

  // ---- 一覧 ------------------------------------------------------------
  function renderList(all) {
    const ol = $('#list');
    for (const e of all) {
      const li = document.createElement('li');
      li.dataset.key = `${e.room} ${e.name} ${e.space}`.toLowerCase();

      const b = document.createElement('button');
      b.type = 'button';
      const num = document.createElement('span');
      num.className = 'room';
      num.textContent = e.room;

      const right = document.createElement('span');
      const t = document.createElement('span');
      t.textContent = e.name;
      const fl = document.createElement('span');
      fl.className = 'fl';
      fl.textContent = e.space ? `${e.floor}階　${e.space}` : `${e.floor}階`;
      right.append(t, fl);

      b.append(num, right);
      b.addEventListener('click', () => openDetail(e.room, e.floor, b));
      li.append(b);
      ol.append(li);
    }
  }
}
