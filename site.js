// 全ページ共通。ハンバーガーと、物販・行き方の中身の描画。
// 置き場所のある要素だけを見て動くので、3ページとも同じこのファイルを読む。

// GitHub Pages は HTML も最大10分ブラウザに保存させる。古いHTMLのままだと
// 新しいCSSやJSが読まれず表示が崩れるので、版が食い違っていたら読み直す。
// 番号は bump.py で version.txt と一緒に上げる。
const BUILD = '7';
fetch('version.txt', { cache: 'no-store' })
  .then((r) => (r.ok ? r.text() : null))
  .then((v) => {
    if (!v) return;
    const latest = v.trim();
    if (latest === BUILD) { sessionStorage.removeItem('afes-reload'); return; }
    if (sessionStorage.getItem('afes-reload') === latest) return; // 繰り返さない
    sessionStorage.setItem('afes-reload', latest);
    location.reload();
  })
  .catch(() => {});


export const $ = (s, r = document) => r.querySelector(s);
export const $$ = (s, r = document) => [...r.querySelectorAll(s)];

export const load = (p) => fetch(p).then((r) => {
  if (!r.ok) throw new Error(`${p} が読み込めません (${r.status})`);
  return r.json();
});

// ---- ハンバーガー --------------------------------------------------------
const bar = $('.bar');
const burger = $('.burger');
if (bar && burger) {
  burger.addEventListener('click', () => {
    const open = bar.dataset.open !== 'true';
    bar.dataset.open = String(open);
    burger.setAttribute('aria-expanded', String(open));
    burger.setAttribute('aria-label', open ? 'メニューを閉じる' : 'メニューを開く');
  });
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && bar.dataset.open === 'true') burger.click();
  });
}

// ---- 物販 ----------------------------------------------------------------
const GOODS_IMG = {
  'T-シャツ': 'goods-tshirt-1.png',
  'シャーペン': 'goods-pen.png',
  'トートバッグ': 'goods-tote.png',
  'タオル': 'goods-towel.png',
  'クリアファイル': 'goods-clearfile.png',
};

if ($('#goods-list')) {
  load('data/goods.json').then((g) => {
    $('#goods-place').textContent = g.place || '';
    const ul = $('#goods-list');
    for (const it of g.goods) {
      const li = document.createElement('li');

      const im = document.createElement('img');
      im.src = `assets/${GOODS_IMG[it.name] || ''}`;
      im.alt = it.name;
      im.loading = 'lazy';

      const mid = document.createElement('div');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = it.name;
      const note = document.createElement('span');
      note.className = 'note';
      note.textContent = it.note || '';
      mid.append(nm, note);

      const pr = document.createElement('div');
      pr.className = 'num disp';
      pr.append(it.price.toLocaleString('ja-JP'));
      const yen = document.createElement('small');
      yen.textContent = '円';
      pr.append(yen);

      li.append(im, mid, pr);
      ul.append(li);
    }
  }).catch(showError);
}

// ---- 行き方 --------------------------------------------------------------
if ($('#stations')) {
  load('data/access.json').then((a) => {
    $('#venue').textContent = [a.venue, a.address].filter(Boolean).join('　');

    const ul = $('#stations');
    for (const s of a.nearestStations || []) {
      const li = document.createElement('li');

      const left = document.createElement('div');
      const ln = document.createElement('span');
      ln.className = 'ln';
      ln.textContent = s.line;
      const st = document.createElement('span');
      st.className = 'st';
      st.textContent = s.station;
      left.append(ln, st);

      const w = document.createElement('div');
      w.className = 'num disp';
      const m = String(s.walk).match(/\d+/);
      if (m) {
        w.append(m[0]);
        const unit = document.createElement('small');
        unit.textContent = '分';
        w.append(unit);
      }

      li.append(left, w);
      ul.append(li);
    }

    $('#return-route').textContent = a.returnRoute || '';
    const nl = $('#notices');
    for (const n of a.notices || []) {
      const li = document.createElement('li');
      li.textContent = n;
      nl.append(li);
    }
  }).catch(showError);
}

function showError(err) {
  console.error(err);
  const p = document.createElement('p');
  p.className = 'foot';
  p.textContent = `読み込みに失敗しました。${err.message}`;
  ($('.wrap') || document.body).append(p);
}
