// 展示と校舎のページ。3Dモデル、展示一覧、最短経路。
import { createScene, buildGraph, shortestPath, describePath, pathLength } from './map3d.js';
import { $, $$, load } from './site.js';

const FLOORS = [1, 2, 3, 4];

init().catch((err) => {
  console.error(err);
  $('#result').textContent = `読み込みに失敗しました。${err.message}`;
});

async function init() {
  const list = await Promise.all(FLOORS.map((f) => load(`data/floor${f}.json`)));
  const floors = {};
  for (const d of list) floors[d.floor] = d;

  // 部屋番号は階をまたいで重複しないので、番号だけで引ける
  const rooms = [];
  for (const f of FLOORS) for (const r of floors[f].rooms) rooms.push({ ...r, floor: f });
  rooms.sort((a, b) => a.room.localeCompare(b.room, 'en', { numeric: true }));

  const graph = buildGraph(floors);
  const scene = createScene($('#stage'), floors, (d) => select(d.floor, d.room));

  renderList(rooms);
  renderSelects(rooms);

  $('#q').addEventListener('input', () => {
    const q = $('#q').value.trim().toLowerCase();
    $$('#list li').forEach((li) => { li.hidden = q !== '' && !li.dataset.key.includes(q); });
  });

  $('.panel-toggle').addEventListener('click', () => {
    const p = $('#panel');
    const open = p.dataset.open !== 'true';
    p.dataset.open = String(open);
    $('.panel-toggle').setAttribute('aria-expanded', String(open));
  });

  // 狭い画面では一覧を畳んでおく。3Dに場所を譲る
  const narrow = matchMedia('(max-width: 820px)').matches;
  $('#panel').dataset.open = String(!narrow);
  $('.panel-toggle').setAttribute('aria-expanded', String(!narrow));

  $$('.floors button').forEach((b) => b.addEventListener('click', () => {
    $$('.floors button').forEach((o) => o.classList.toggle('on', o === b));
    scene.showFloor(Number(b.dataset.floor));
  }));

  $('#go').addEventListener('click', route);

  function select(floor, room) {
    const r = rooms.find((x) => x.room === room && x.floor === floor);
    if (!r) return;
    scene.highlight([`${floor}:${room}`]);

    let box = $('.pick');
    if (!box) {
      box = document.createElement('div');
      box.className = 'pick';
      // 一覧の下だとパネルの外にはみ出すので、検索欄の直下に置く
      $('#list').before(box);
    }
    box.textContent = '';

    const h = document.createElement('h3');
    const num = document.createElement('span');
    num.className = 'room';
    num.textContent = r.room;
    const nm = document.createElement('span');
    nm.textContent = r.name;
    h.append(num, nm);

    const p = document.createElement('p');
    p.textContent = r.desc || `${r.floor}階`;

    box.append(h, p);
    $('#panel').dataset.open = 'true';
    $('.panel-toggle').setAttribute('aria-expanded', 'true');
  }

  function route() {
    const a = $('#from').value, b = $('#to').value;
    const out = $('#result');
    out.textContent = '';
    if (!a || !b || a === b) { out.textContent = '出発と目的に別の展示を選んでください。'; return; }

    const res = shortestPath(graph, a, b, { noStairs: $('#nostairs').checked });
    if (!res) { out.textContent = '経路が見つかりません。階段を使わない条件を外すと出る場合があります。'; return; }

    scene.drawRoute(res.path);
    scene.highlight([a, b].map((k) => k.slice(1)));

    const name = (k) => {
      const [f, rm] = k.slice(1).split(':');
      const r = rooms.find((x) => x.room === rm && x.floor === Number(f));
      return `${rm} ${r ? r.name : ''}`.trim();
    };

    const sum = document.createElement('div');
    sum.className = 'sum';
    sum.textContent = `${name(a)} から ${name(b)} まで 歩く距離 およそ ${Math.round(pathLength(res.path) / 5) * 5} m`;
    out.append(sum);

    const steps = describePath(res.path);
    for (const s of steps.length ? steps : ['同じ階です。廊下をそのまま進みます。']) {
      const d = document.createElement('div');
      d.className = 'step';
      d.textContent = s;
      out.append(d);
    }
  }

  function renderList(all) {
    const ol = $('#list');
    for (const r of all) {
      const li = document.createElement('li');
      li.dataset.key = `${r.room} ${r.name}`.toLowerCase();

      const b = document.createElement('button');
      const num = document.createElement('span');
      num.className = 'room';
      num.textContent = r.room;

      const right = document.createElement('span');
      const t = document.createElement('span');
      t.textContent = r.name;
      const fl = document.createElement('span');
      fl.className = 'fl';
      fl.textContent = `${r.floor}階`;
      right.append(t, fl);

      b.append(num, right);
      b.addEventListener('click', () => select(r.floor, r.room));
      li.append(b);
      ol.append(li);
    }
  }

  function renderSelects(all) {
    for (const sel of [$('#from'), $('#to')]) {
      for (const r of all) {
        const o = document.createElement('option');
        o.value = `r${r.floor}:${r.room}`;
        o.textContent = `${r.room} ${r.name}`;
        sel.append(o);
      }
    }
    // 離れた2室を既定にして、押した瞬間に意味のある経路が出るようにする
    $('#from').value = 'r1:100';
    $('#to').value = 'r4:421';
  }
}
