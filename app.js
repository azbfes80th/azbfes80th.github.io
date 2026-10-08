// 展示と校舎のページ。3Dモデル、展示一覧、最短経路。
// 3Dと階のタブの間の枠（#slot）には、展示の説明か道順のどちらかを出す。
import { createScene, buildGraph, shortestPath, describePath, pathLength } from './map3d.js?v=8';
import { $, $$, load } from './site.js?v=8';

const FLOORS = [1, 2, 3, 4];

init().catch((err) => {
  console.error(err);
  const p = document.createElement('p');
  p.className = 'hint';
  p.textContent = `読み込みに失敗しました。${err.message}`;
  $('#map').append(p);
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
  // 道順の目印に使う。階が分からない場合は部屋番号だけで引く
  const nameOf = (room, floor) => {
    const r = findRoom(room, floor) || rooms.find((x) => x.room === room);
    if (!r) return '';
    return r.space || r.exhibits[0].name;
  };

  // 一覧は展示ごとに1行。1部屋に複数の展示が入ることがある
  const entries = [];
  for (const r of rooms) for (const ex of r.exhibits) entries.push({ ...ex, room: r.room, floor: r.floor, space: r.space });

  const narrow = () => matchMedia('(max-width: 820px)').matches;
  // 狭い画面では、道順を出している間だけ一覧と出発・目的を隠して手順に場所を譲る
  const setMode = (m) => { if (m) $('#map').dataset.mode = m; else delete $('#map').dataset.mode; };

  const graph = buildGraph(floors);
  const scene = createScene($('#stage'), floors, (d) => openDetail(d.room, d.floor, null));

  renderList(entries);
  $('.title small').textContent = `展示と校舎　普通教室棟と講堂、展示${entries.length}件`;

  $('#q').addEventListener('input', () => {
    const q = $('#q').value.trim().toLowerCase();
    $$('#list li').forEach((li) => { li.hidden = q !== '' && !li.dataset.key.includes(q); });
  });

  $('.panel-toggle').addEventListener('click', () => togglePanel());
  togglePanel(!narrow()); // 狭い画面では畳んで3Dに場所を譲る

  $$('.floors button').forEach((b) => b.addEventListener('click', () => {
    $$('.floors button').forEach((o) => o.classList.toggle('on', o === b));
    scene.showFloor(Number(b.dataset.floor));
  }));

  function togglePanel(force) {
    const p = $('#panel');
    const open = force ?? p.dataset.open !== 'true';
    p.dataset.open = String(open);
    $('.panel-toggle').setAttribute('aria-expanded', String(open));
  }

  // ---- 状態 ------------------------------------------------------------
  const leg = { from: null, to: null };
  let noStairs = false;
  let viewing = null; // 説明を開いている部屋

  function paintRooms() {
    const paint = {};
    if (viewing) paint[`${viewing.floor}:${viewing.room}`] = 'red';
    if (leg.from) paint[`${leg.from.floor}:${leg.from.room}`] = 'red';
    if (leg.to) paint[`${leg.to.floor}:${leg.to.room}`] = 'green';
    scene.highlight(paint);
  }

  // ---- 3Dと階のタブの間の枠 --------------------------------------------
  const slot = $('#slot');

  // 道順は3Dを隠さないよう左へ寄せる。説明は3Dと階のタブの間のまま
  function show(el) {
    setMode(el && el.classList.contains('routecard') && leg.from && leg.to ? 'route' : null);
    if (!el) { slot.hidden = true; slot.replaceChildren(); return; }
    slot.classList.toggle('as-route', el.classList.contains('routecard'));
    slot.replaceChildren(el);
    slot.hidden = false;
  }

  // 説明を閉じたら、行き先が決まっていれば道順に戻す
  function back() {
    viewing = null;
    paintRooms();
    show(leg.from || leg.to ? routeCard() : null);
  }

  function openDetail(room, floor, rowEl) {
    const r = findRoom(room, floor);
    if (!r) return;
    viewing = { room, floor };
    paintRooms();
    setMode(null);
    if (narrow()) togglePanel(false);

    const paint = () => show(detailCard(r));

    // 一覧の行から枠の位置まで、形を保ったまま動かす。
    // 対応していないブラウザと、タブが裏にあって中断された場合はそのまま描画する。
    if (!document.startViewTransition || !rowEl || document.visibilityState !== 'visible') { paint(); return; }

    rowEl.style.viewTransitionName = 'pick';
    const update = () => {
      rowEl.style.viewTransitionName = '';
      paint();
      slot.firstElementChild.style.viewTransitionName = 'pick';
    };
    const cleanup = () => {
      const c = slot.firstElementChild;
      if (c) c.style.viewTransitionName = '';
      rowEl.style.viewTransitionName = '';
    };

    let t;
    try { t = document.startViewTransition({ update, types: ['pick'] }); }
    catch { try { t = document.startViewTransition(update); } catch { paint(); return; } }
    t.updateCallbackDone.catch(() => { paint(); });
    t.finished.catch(() => {}).finally(cleanup);
  }

  function detailCard(r) {
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
    head.append(num, nm, fl, closeButton(back));

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
    for (const [which, label] of [['from', 'ここから出発'], ['to', 'ここへ行く']]) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = which === 'from' ? 'pill' : 'pill ghost';
      b.textContent = label;
      b.addEventListener('click', () => setLeg(which, r.room, r.floor));
      act.append(b);
    }

    el.append(head, body, act);
    return el;
  }

  function closeButton(fn) {
    const x = document.createElement('button');
    x.type = 'button';
    x.className = 'x';
    x.setAttribute('aria-label', '閉じる');
    x.textContent = '×';
    x.addEventListener('click', fn);
    return x;
  }

  // ---- 道順 --------------------------------------------------------------
  function setLeg(which, room, floor) {
    const other = which === 'from' ? 'to' : 'from';
    if (leg[other] && leg[other].room === room && leg[other].floor === floor) leg[other] = null;
    leg[which] = { room, floor };
    viewing = null; // 選んだら説明を閉じる
    if (leg.from && leg.to && narrow()) togglePanel(false);
    paintRooms();
    show(routeCard());
  }

  function clearLegs() {
    leg.from = null;
    leg.to = null;
    viewing = null;
    paintRooms();
    scene.drawRoute(null);
    show(null);
  }

  function routeCard() {
    const el = document.createElement('div');
    el.className = 'detail card routecard';

    const head = document.createElement('div');
    head.className = 'rhead';
    for (const [which, k] of [['from', '出発'], ['to', '目的']]) {
      const c = document.createElement('span');
      c.className = `chip ${which}`;
      const key = document.createElement('span');
      key.className = 'ck';
      key.textContent = k;
      const val = document.createElement('b');
      const v = leg[which];
      val.textContent = v ? `${v.room} ${nameOf(v.room, v.floor)}` : '未選択';
      if (!v) c.classList.add('empty');
      c.append(key, val);
      head.append(c);
    }
    head.append(closeButton(clearLegs));

    el.append(head);

    if (!leg.from || !leg.to) {
      scene.drawRoute(null);
      const p = document.createElement('p');
      p.className = 'rnote';
      p.textContent = 'もう一方を一覧から選んでください。';
      el.append(p);
      return el;
    }

    const a = `r${leg.from.floor}:${leg.from.room}`;
    const b = `r${leg.to.floor}:${leg.to.room}`;
    const res = shortestPath(graph, a, b, { noStairs });

    if (!res) {
      scene.drawRoute(null);
      const p = document.createElement('p');
      p.className = 'rnote';
      p.textContent = '経路が見つかりません。階段を使わない条件を外すと出る場合があります。';
      el.append(p, routeFoot(null));
      return el;
    }

    scene.drawRoute(res.path);
    const ol = document.createElement('ol');
    ol.className = 'rsteps';
    for (const s of describePath(res.path, nameOf)) {
      const li = document.createElement('li');
      li.textContent = s;
      ol.append(li);
    }
    el.append(ol, routeFoot(Math.round(pathLength(res.path) / 5) * 5));
    return el;
  }

  function routeFoot(metres) {
    const foot = document.createElement('div');
    foot.className = 'rfoot';

    const lab = document.createElement('label');
    lab.className = 'opt';
    const cb = document.createElement('input');
    cb.type = 'checkbox';
    cb.checked = noStairs;
    cb.addEventListener('change', () => { noStairs = cb.checked; show(routeCard()); });
    const sp = document.createElement('span');
    sp.textContent = '階段を使わない';
    lab.append(cb, sp);
    foot.append(lab);

    if (metres != null) {
      const d = document.createElement('span');
      d.className = 'dist';
      d.textContent = `歩く距離 およそ ${metres} m`;
      foot.append(d);
    }
    return foot;
  }

  // ---- 一覧 --------------------------------------------------------------
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
