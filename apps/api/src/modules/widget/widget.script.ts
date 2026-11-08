// Script do balão de chat. Uso no site:
//   <script src="https://API/widget.js" data-channel="CHANNEL_ID" async></script>
// A URL da API é deduzida do próprio src do script.
export const WIDGET_SCRIPT = String.raw`(function () {
  var s = document.currentScript;
  if (!s) return;
  var channel = s.getAttribute('data-channel');
  if (!channel) return;
  var api = new URL(s.src).origin;
  var KEY = 'sf_widget_' + channel;
  var state = { vid: null, after: null, open: false, seen: {}, timer: null };

  try { state.vid = localStorage.getItem(KEY + '_vid'); state.after = localStorage.getItem(KEY + '_after'); } catch (e) {}
  if (!state.vid) {
    var a = new Uint8Array(24); (window.crypto || window.msCrypto).getRandomValues(a);
    state.vid = Array.prototype.map.call(a, function (b) { return ('0' + b.toString(16)).slice(-2); }).join('');
    try { localStorage.setItem(KEY + '_vid', state.vid); } catch (e) {}
  }

  function get(path) { return fetch(api + path).then(function (r) { if (!r.ok) throw new Error(r.status); return r.json(); }); }

  get('/widget/' + channel + '/config').then(init).catch(function () {});

  function init(cfg) {
    var color = cfg.color || '#6366f1';
    var right = cfg.position !== 'bottom-left';
    var host = document.createElement('div');
    host.style.cssText = 'position:fixed;bottom:20px;' + (right ? 'right' : 'left') + ':20px;z-index:2147483000;';
    var root = host.attachShadow({ mode: 'open' });
    root.innerHTML =
      '<style>' +
      '*{box-sizing:border-box;font-family:-apple-system,Segoe UI,Roboto,sans-serif}' +
      '.btn{width:60px;height:60px;border-radius:50%;border:0;cursor:pointer;background:' + color + ';color:#fff;box-shadow:0 4px 16px rgba(0,0,0,.25);font-size:26px}' +
      '.box{display:none;position:absolute;bottom:76px;' + (right ? 'right' : 'left') + ':0;width:360px;max-width:calc(100vw - 40px);height:520px;max-height:calc(100vh - 110px);background:#fff;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.25);overflow:hidden;flex-direction:column}' +
      '.box.on{display:flex}' +
      '.hd{background:' + color + ';color:#fff;padding:14px 16px;display:flex;align-items:center;gap:10px}' +
      '.hd img{width:40px;height:40px;border-radius:50%;object-fit:cover}' +
      '.hd b{display:block;font-size:15px}.hd small{opacity:.9;font-size:12px}' +
      '.x{margin-left:auto;background:none;border:0;color:#fff;font-size:22px;cursor:pointer}' +
      '.ms{flex:1;overflow-y:auto;padding:14px;background:#f4f4f5;display:flex;flex-direction:column;gap:8px}' +
      '.m{max-width:82%;padding:10px 12px;border-radius:14px;font-size:14px;line-height:1.4;white-space:pre-wrap;word-wrap:break-word}' +
      '.m.bot{background:#fff;color:#18181b;align-self:flex-start}' +
      '.m.me{background:' + color + ';color:#fff;align-self:flex-end}' +
      '.ft{display:flex;gap:8px;padding:10px;border-top:1px solid #e4e4e7;background:#fff}' +
      '.ft input{flex:1;border:1px solid #d4d4d8;border-radius:20px;padding:10px 14px;font-size:14px;outline:none}' +
      '.ft button{border:0;border-radius:20px;padding:0 16px;background:' + color + ';color:#fff;font-size:14px;cursor:pointer}' +
      '</style>' +
      '<div class="box"><div class="hd">' + (cfg.avatarUrl ? '<img alt="" src="">' : '') +
      '<div><b></b><small>Online agora</small></div><button class="x" aria-label="Fechar">×</button></div>' +
      '<div class="ms"></div><form class="ft"><input maxlength="2000" placeholder="Digite sua mensagem..." autocomplete="off"><button type="submit">Enviar</button></form></div>' +
      '<button class="btn" aria-label="Abrir chat">💬</button>';
    document.body.appendChild(host);

    var box = root.querySelector('.box'), ms = root.querySelector('.ms'), form = root.querySelector('form'), input = root.querySelector('input');
    root.querySelector('.hd b').textContent = cfg.name || 'Atendimento';
    var img = root.querySelector('.hd img'); if (img) img.src = cfg.avatarUrl;

    function add(text, me, id) {
      if (id) { if (state.seen[id]) return; state.seen[id] = 1; }
      var d = document.createElement('div'); d.className = 'm ' + (me ? 'me' : 'bot'); d.textContent = text;
      ms.appendChild(d); ms.scrollTop = ms.scrollHeight;
    }
    add(cfg.welcomeMessage, false);

    function poll() {
      var q = '/widget/' + channel + '/messages?visitorId=' + state.vid + (state.after ? '&after=' + encodeURIComponent(state.after) : '');
      get(q).then(function (r) {
        r.messages.forEach(function (m) {
          add(m.content, false, m.id);
          state.after = m.createdAt;
          try { localStorage.setItem(KEY + '_after', state.after); } catch (e) {}
        });
      }).catch(function () {});
    }
    function toggle(on) {
      state.open = on; box.classList.toggle('on', on);
      clearInterval(state.timer);
      if (on) { input.focus(); poll(); state.timer = setInterval(poll, 3000); }
    }
    root.querySelector('.btn').onclick = function () { toggle(!state.open); };
    root.querySelector('.x').onclick = function () { toggle(false); };
    form.onsubmit = function (e) {
      e.preventDefault();
      var t = input.value.trim(); if (!t) return;
      input.value = ''; add(t, true);
      fetch(api + '/widget/' + channel + '/messages', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: state.vid, text: t })
      }).catch(function () { add('Não foi possível enviar. Tente novamente.', false); });
    };
  }
})();
`
