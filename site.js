// 全ページ共通。ハンバーガーと、物販・行き方の中身の描画。
// 置き場所のある要素だけを見て動くので、3ページとも同じこのファイルを読む。

// GitHub Pages は HTML も最大10分ブラウザに保存させる。古いHTMLのままだと
// 新しいCSSやJSが読まれず表示が崩れるので、版が食い違っていたら読み直す。
// 番号は bump.py で version.txt と一緒に上げる。
const BUILD = '18';
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

// データのJSONもブラウザに保存される。版の番号を付けて古い内容を避ける
export const load = (p) => fetch(`${p}${p.includes('?') ? '&' : '?'}v=${BUILD}`).then((r) => {
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
// Tシャツは4種あるので、その行だけ写真を4枚並べる
const GOODS_IMG = {
  'T-シャツ': ['goods-tshirt-1.png', 'goods-tshirt-2.png', 'goods-tshirt-3.png', 'goods-tshirt-4.png'],
  'シャーペン': ['goods-pen.png'],
  'トートバッグ': ['goods-tote.png'],
  'タオル': ['goods-towel.png'],
  'クリアファイル': ['goods-clearfile.png'],
};

if ($('#goods-list')) {
  load('data/goods.json').then((g) => {
    $('#goods-place').textContent = g.place || '';
    const ul = $('#goods-list');
    for (const it of g.goods) {
      const li = document.createElement('li');

      const pics = document.createElement('div');
      pics.className = 'pics';
      for (const src of GOODS_IMG[it.name] || []) {
        const im = document.createElement('img');
        im.src = `assets/${src}`;
        im.alt = it.name;
        im.loading = 'lazy';
        pics.append(im);
      }

      const mid = document.createElement('div');
      const nm = document.createElement('span');
      nm.className = 'nm';
      nm.textContent = it.name;
      mid.append(nm);
      if (it.note) {
        const note = document.createElement('span');
        note.className = 'note';
        note.textContent = it.note;
        mid.append(note);
      }

      const pr = document.createElement('div');
      pr.className = 'num disp';
      pr.append(it.price.toLocaleString('ja-JP'));
      const yen = document.createElement('small');
      yen.textContent = '円';
      pr.append(yen);

      li.append(pics, mid, pr);
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

    const bl = $('#buses');
    if (bl && (a.buses || []).length) {
      for (const b of a.buses) {
        const li = document.createElement('li');
        const left = document.createElement('div');
        const ln = document.createElement('span');
        ln.className = 'ln';
        ln.textContent = b.line;
        const st = document.createElement('span');
        st.className = 'st';
        st.textContent = b.stop ? `${b.stop}で降車` : b.route;
        left.append(ln, st);
        if (b.stop && b.route) {
          const sub = document.createElement('span');
          sub.className = 'ln';
          sub.textContent = b.route;
          left.append(sub);
        }
        const w = document.createElement('div');
        w.className = 'num disp';
        const m = String(b.walk || '').match(/\d+/);
        if (m) {
          w.append(m[0]);
          const unit = document.createElement('small');
          unit.textContent = '分';
          w.append(unit);
        }
        li.append(left, w);
        bl.append(li);
      }
    } else if (bl) {
      bl.closest('section, div')?.remove();
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
