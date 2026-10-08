// 全ページ共通。ハンバーガーと、物販・行き方の中身の描画。
// 置き場所のある要素だけを見て動くので、3ページとも同じこのファイルを読む。

// GitHub Pages は HTML も最大10分ブラウザに保存させる。古いHTMLのままだと
// 新しいCSSやJSが読まれず表示が崩れるので、版が食い違っていたら読み直す。
// 番号は bump.py で version.txt と一緒に上げる。
const BUILD = '17';
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
