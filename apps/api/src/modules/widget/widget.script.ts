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
      '.ft input{flex:1;min-width:0;border:1px solid #d4d4d8;border-radius:20px;padding:10px 14px;font-size:16px;outline:none}' +
      '.ft button{border:0;border-radius:20px;padding:0 16px;background:' + color + ';color:#fff;font-size:14px;cursor:pointer}' +
      '.btn{position:relative;padding:0;overflow:visible;display:flex;align-items:center;justify-content:center}' +
      '.btn img{width:100%;height:100%;border-radius:50%;object-fit:cover;border:3px solid ' + color + ';background:#fff}' +
      '.btn i{position:absolute;right:2px;bottom:2px;width:14px;height:14px;border-radius:50%;background:#22c55e;border:2px solid #fff}' +
      '.lead{display:none;flex:1;flex-direction:column;gap:12px;padding:16px;background:#f4f4f5;overflow-y:auto}' +
      '.lead p{margin:0;font-size:14px;line-height:1.4;color:#18181b;white-space:pre-wrap}' +
      '.lead label{display:block;font-size:12px;color:#52525b;margin-bottom:4px}' +
      '.lead input{width:100%;border:1px solid #d4d4d8;border-radius:10px;padding:11px 12px;font-size:16px;outline:none;background:#fff}' +
      '.lead button{border:0;border-radius:10px;padding:12px;background:' + color + ';color:#fff;font-size:15px;cursor:pointer}' +
      '.lead button:disabled{opacity:.6;cursor:default}' +
      '.lead small{font-size:11px;color:#71717a;line-height:1.35}' +
      '.lead .er{color:#b91c1c;font-size:12px;min-height:16px}' +
      '.box.lead-on .lead{display:flex}.box.lead-on .ms,.box.lead-on .ft{display:none}' +
      '@media (max-width:520px){.box{position:fixed;left:0;right:0;top:0;bottom:0;width:auto;max-width:none;height:100vh;height:100dvh;max-height:none;border-radius:0}.hd{padding-top:max(14px,env(safe-area-inset-top))}.ft{padding-bottom:max(10px,env(safe-area-inset-bottom))}.box.on+.btn{display:none}}' +
      '</style>' +
      '<div class="box"><div class="hd">' + (cfg.avatarUrl ? '<img alt="" src="">' : '') +
      '<div><b></b><small>Online agora</small></div><button class="x" aria-label="Fechar">×</button></div>' +
      '<form class="lead" novalidate><p class="li"></p>' +
      '<div><label>Seu nome</label><input name="n" maxlength="80" autocomplete="name" placeholder="Como podemos te chamar?"></div>' +
      '<div><label>Seu WhatsApp (com DDD)</label><input name="p" type="tel" maxlength="20" autocomplete="tel" placeholder="(32) 99999-0000"></div>' +
      '<div class="er"></div><button type="submit">Iniciar conversa</button>' +
      '<small>Usamos seu nome e WhatsApp apenas para o seu atendimento e para retornar o contato.</small></form>' +
      '<div class="ms"></div><form class="ft"><input maxlength="2000" placeholder="Digite sua mensagem..." autocomplete="off"><button type="submit">Enviar</button></form></div>' +
      '<button class="btn" aria-label="Abrir chat">' +
      (cfg.avatarUrl
        ? '<img alt="" src=""><i></i>'
        : '<svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>') +
      '</button>';
    document.body.appendChild(host);

    var box = root.querySelector('.box'), ms = root.querySelector('.ms'), form = root.querySelector('.ft'), input = root.querySelector('.ft input');
    root.querySelector('.hd b').textContent = cfg.name || 'Atendimento';
    var img = root.querySelector('.hd img'); if (img) img.src = cfg.avatarUrl;
    var bimg = root.querySelector('.btn img'); if (bimg) bimg.src = cfg.avatarUrl;

    function add(text, me, id) {
      if (id) { if (state.seen[id]) return; state.seen[id] = 1; }
      var d = document.createElement('div'); d.className = 'm ' + (me ? 'me' : 'bot'); d.textContent = text;
      ms.appendChild(d); ms.scrollTop = ms.scrollHeight;
    }
    add(cfg.welcomeMessage, false);

    // Formulário inicial: nome + WhatsApp antes de abrir o chat (desligável no canal: requireLead=false)
    var gotLead = false; try { gotLead = localStorage.getItem(KEY + '_lead') === '1'; } catch (e) {}
    var leadForm = root.querySelector('.lead'), leadErr = root.querySelector('.er'), leadBtn = leadForm.querySelector('button');
    var nameIn = leadForm.querySelector('[name=n]'), phoneIn = leadForm.querySelector('[name=p]');
    leadForm.querySelector('.li').textContent = cfg.welcomeMessage + '\n\nPara começar, informe seu nome e seu WhatsApp.';
    box.classList.toggle('lead-on', cfg.requireLead !== false && !gotLead);
    leadForm.onsubmit = function (e) {
      e.preventDefault();
      var n = nameIn.value.trim(), p = phoneIn.value.trim();
      if (n.length < 2) { leadErr.textContent = 'Informe seu nome.'; nameIn.focus(); return; }
      if (p.replace(/D/g, '').length < 10) { leadErr.textContent = 'Informe o WhatsApp com DDD.'; phoneIn.focus(); return; }
      leadErr.textContent = ''; leadBtn.disabled = true;
      fetch(api + '/widget/' + channel + '/lead', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ visitorId: state.vid, name: n, phone: p, page: location.href.slice(0, 400), title: (document.title || '').slice(0, 160) })
      }).then(function (r) { return r.json().then(function (j) { return { ok: r.ok, j: j }; }); })
        .then(function (res) {
          leadBtn.disabled = false;
          if (!res.ok) { leadErr.textContent = (res.j && res.j.error) || 'Não foi possível continuar. Tente de novo.'; return; }
          try { localStorage.setItem(KEY + '_lead', '1'); } catch (e2) {}
          box.classList.remove('lead-on'); input.focus();
        })
        .catch(function () { leadBtn.disabled = false; leadErr.textContent = 'Sem conexão. Tente de novo.'; });
    };

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
      if (on) { (box.classList.contains('lead-on') ? nameIn : input).focus(); poll(); state.timer = setInterval(poll, 3000); }
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
