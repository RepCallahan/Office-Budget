/**
 * Shared helpers for the Office Passwords Trello Power-Up.
 * Everything is stored in board-level shared pluginData under the short key "p"
 * (Trello caps one Power-Up's board/shared data at 4096 characters).
 *
 * Stored shape (as compact as possible): an array of [name, url, username, password].
 *   [["Example","example.com","user","pass"], ...]
 * No keys, ids or timestamps. URLs are saved without https://, www. and trailing slashes.
 * No encryption, by the office's choice: anyone with board access can read it.
 */
(function (root) {
  var KEY = 'p';
  var LIMIT = 4096;
  var WARN_RATIO = 0.8;
  var ASSET_VERSION = '20261127b';
  var MAX = { name: 40, url: 80, user: 60, pass: 64 };

  function baseUrl() {
    var path = (window.location.pathname || '/').split('?')[0].replace(/(index|logins)\.html$/i, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    return window.location.origin + path;
  }
  function assetUrl(rel) { return baseUrl() + rel + '?v=' + ASSET_VERSION; }
  function iconUrl() { return { dark: assetUrl('img/icon-dark.svg'), light: assetUrl('img/icon-light.svg') }; }

  function empty() { return []; }

  // Accepts the current array format. Also reads the earlier test format
  // {c:[...], e:[[name,url,user,pass,cat,notes]]} and keeps the first four fields.
  function normalize(raw) {
    var data = raw;
    if (typeof data === 'string') { try { data = JSON.parse(data); } catch (err) { data = null; } }
    if (data && !Array.isArray(data) && Array.isArray(data.e)) data = data.e;
    if (!Array.isArray(data)) return empty();
    var out = [];
    data.forEach(function (r) {
      if (Array.isArray(r)) out.push([r[0] || '', r[1] || '', r[2] || '', r[3] || '']);
    });
    return out;
  }

  function pack(data) {
    return data.map(function (r) {
      var row = r.slice(0, 4);
      while (row.length > 1 && row[row.length - 1] === '') row.pop();
      return row;
    });
  }

  function size(data) { return JSON.stringify(pack(data)).length; }

  function capacity(data) {
    var used = size(data);
    var n = data.length;
    var avg = n ? Math.max(30, Math.round((used - 1) / n)) : 70;
    return {
      used: used, limit: LIMIT, ratio: used / LIMIT, warn: used / LIMIT >= WARN_RATIO,
      full: used > LIMIT, avg: avg, roomFor: Math.max(0, Math.floor((LIMIT - used) / avg))
    };
  }

  function load(t) {
    return t.get('board', 'shared', KEY).then(normalize);
  }
  function save(t, data) {
    return t.set('board', 'shared', KEY, pack(data));
  }

  // Saved form of a website: no https://, no www., no trailing slash.
  function stripScheme(u) {
    return String(u || '').trim().replace(/^https?:\/\//i, '').replace(/^www\./i, '').replace(/\/+$/, '');
  }
  function openUrl(u) {
    u = String(u || '').trim();
    if (!u) return '';
    return /^[a-z][a-z0-9+.-]*:\/\//i.test(u) ? u : 'https://' + u;
  }

  function generatePassword(len) {
    len = len || 16;
    var sets = ['ABCDEFGHJKLMNPQRSTUVWXYZ', 'abcdefghijkmnopqrstuvwxyz', '23456789', '!@#$%^&*?'];
    var all = sets.join('');
    function rnd(n) {
      var a = new Uint32Array(1), lim = Math.floor(4294967296 / n) * n, x;
      do { crypto.getRandomValues(a); x = a[0]; } while (x >= lim);
      return x % n;
    }
    var chars = sets.map(function (s) { return s.charAt(rnd(s.length)); });
    while (chars.length < len) chars.push(all.charAt(rnd(all.length)));
    for (var i = chars.length - 1; i > 0; i--) { var j = rnd(i + 1); var tmp = chars[i]; chars[i] = chars[j]; chars[j] = tmp; }
    return chars.join('');
  }

  function applyTheme(t) {
    var ctx = typeof t.getContext === 'function' ? t.getContext() : null;
    var set = function (th) { document.body.setAttribute('data-theme', th === 'dark' ? 'dark' : 'light'); };
    set((ctx && ctx.theme) || 'light');
    if (typeof t.subscribeToThemeChanges === 'function') t.subscribeToThemeChanges(set);
  }

  root.Vault = {
    KEY: KEY, LIMIT: LIMIT, ASSET_VERSION: ASSET_VERSION, MAX: MAX,
    iconUrl: iconUrl, empty: empty, normalize: normalize, pack: pack, size: size, capacity: capacity,
    load: load, save: save, stripScheme: stripScheme, openUrl: openUrl,
    generatePassword: generatePassword, applyTheme: applyTheme
  };
})(this);
