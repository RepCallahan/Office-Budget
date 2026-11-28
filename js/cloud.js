/**
 * OfficeCloud: Google storage for the Office Power-Ups.
 *
 * Data lives in the Office Budget Email Apps Script (script storage), not on
 * Trello. The script link and a long random key are kept in this Power-Up's
 * board-shared pluginData under "g" ({u: scriptUrl, s: key, on: 1}), which only
 * board members can read. The key is never shown in the app.
 *
 * Requests are POSTed as text/plain (no CORS preflight). The body starts with
 * "OFFICEDATA1:" so an older copy of the script (which only knows snapshot and
 * email) fails to parse it instead of sending an email.
 *
 * Moving from Trello happens once, automatically, on open:
 *   save link + key on the board -> claim the key in the script -> if Google
 *   already has committed data, use it; otherwise write the Trello copy staged,
 *   read it back, check the text, hash and count match, commit, then turn
 *   Google mode on. Trello data is never changed or removed.
 */
(function (root) {
  var PREFIX = 'OFFICEDATA1:';
  var CONFIG_KEY = 'g';
  var TIMEOUT_MS = 25000;
  var URL_RE = /^https:\/\/script\.google\.com\/(?:a\/macros\/[^/?#]+\/|macros\/)s\/[A-Za-z0-9_-]{10,}\/exec$/;

  function cleanUrl(u) {
    return String(u || '').trim().split('#')[0].split('?')[0].replace(/\/+$/, '');
  }
  function isScriptUrl(u) { return URL_RE.test(cleanUrl(u)); }

  function makeErr(code, extra) {
    var err = new Error(code);
    err.code = code;
    if (extra) Object.keys(extra).forEach(function (k) { err[k] = extra[k]; });
    return err;
  }

  function hash(str) {
    str = String(str == null ? '' : str);
    var h = 0x811c9dc5;
    for (var i = 0; i < str.length; i++) {
      h ^= str.charCodeAt(i);
      h = Math.imul ? Math.imul(h, 0x01000193) : (h * 0x01000193) | 0;
      h >>>= 0;
    }
    return ('00000000' + h.toString(16)).slice(-8) + ':' + str.length;
  }

  function newSecret() {
    var c = root.crypto || (typeof crypto !== 'undefined' ? crypto : null);
    if (!c || typeof c.getRandomValues !== 'function') throw makeErr('NO_CRYPTO');
    var bytes = new Uint8Array(48);
    c.getRandomValues(bytes);
    var chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
    var out = '';
    for (var i = 0; i < bytes.length; i++) out += chars.charAt(bytes[i] & 63);
    return out; // 48 chars, 288 random bits
  }

  function request(url, payload, opts) {
    opts = opts || {};
    var fetchImpl = opts.fetch || (typeof root.fetch === 'function' ? root.fetch.bind(root) : null);
    if (!fetchImpl) return Promise.reject(makeErr('NETWORK'));
    var ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    var timer = null;
    var init = {
      method: 'POST',
      redirect: 'follow',
      credentials: 'omit',
      cache: 'no-store',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: PREFIX + JSON.stringify(payload)
    };
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { try { ctrl.abort(); } catch (e) {} }, opts.timeout || TIMEOUT_MS);
    }
    return Promise.resolve().then(function () {
      return fetchImpl(cleanUrl(url), init);
    }).then(function (res) {
      return res.text();
    }, function () {
      throw makeErr('NETWORK');
    }).then(function (txt) {
      if (timer) clearTimeout(timer);
      var data;
      try { data = JSON.parse(txt); } catch (e) { throw makeErr('NOT_UPDATED'); }
      if (!data || typeof data !== 'object') throw makeErr('NOT_UPDATED');
      if (!data.ok) throw makeErr(String(data.code || 'ERROR'), { rev: data.rev });
      return data;
    }, function (err) {
      if (timer) clearTimeout(timer);
      throw err;
    });
  }

  function ping(url, app, opts) { return request(url, { a: 'ping', app: app }, opts); }
  function claim(url, app, secret, opts) { return request(url, { a: 'claim', app: app, k: secret }, opts); }
  function get(url, app, secret, opts) {
    return request(url, { a: 'get', app: app, k: secret }, opts).then(function (r) {
      return { has: !!r.has, staged: !!r.staged, rev: Number(r.rev) || 0, body: r.has ? String(r.body || '') : '', hash: r.hash || '' };
    });
  }
  function put(url, app, secret, body, base, staged, opts) {
    return request(url, { a: 'put', app: app, k: secret, body: String(body), base: Number(base) || 0, staged: staged ? 1 : 0, h: hash(body) }, opts)
      .then(function (r) { return { rev: Number(r.rev) || 0, hash: r.hash || '' }; });
  }
  function commit(url, app, secret, rev, opts) { return request(url, { a: 'commit', app: app, k: secret, base: Number(rev) || 0 }, opts); }
  function clear(url, app, secret, base, opts) {
    return request(url, { a: 'clear', app: app, k: secret, base: Number(base) || 0 }, opts)
      .then(function (r) { return { rev: Number(r.rev) || 0 }; });
  }

  function parseConfig(raw) {
    if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { raw = null; } }
    if (!raw || typeof raw !== 'object') return null;
    var cfg = { u: cleanUrl(raw.u), s: String(raw.s || '') };
    if (raw.on) cfg.on = 1;
    return cfg;
  }
  function isOn(cfg) { return !!(cfg && cfg.on && cfg.s && isScriptUrl(cfg.u)); }
  // Errors are passed on (not treated as "no config"), so a Trello hiccup can
  // never make the app create a new key and lose the old one.
  function getConfig(t) {
    return Promise.resolve().then(function () { return t.get('board', 'shared', CONFIG_KEY); })
      .then(parseConfig);
  }
  function setConfig(t, cfg) {
    var packed = { u: cleanUrl(cfg.u), s: String(cfg.s) };
    if (cfg.on) packed.on = 1;
    return Promise.resolve().then(function () { return t.set('board', 'shared', CONFIG_KEY, packed); })
      .then(function () { return parseConfig(packed); }, function () { throw makeErr('CONFIG_SAVE'); });
  }

  // Read with the board key. If the script lost its key (resetDataAccess was run),
  // claim it again with this board's key and retry once.
  function getWithClaim(cfg, app, opts) {
    return get(cfg.u, app, cfg.s, opts).catch(function (err) {
      if (err && err.code === 'NOT_CLAIMED') {
        return claim(cfg.u, app, cfg.s, opts).then(function () { return get(cfg.u, app, cfg.s, opts); });
      }
      throw err;
    });
  }

  /**
   * One-time move. opts: { app, url, fetch, readLocal: () => Promise<{body,count}|null>, countOf: body => number }
   * Resolves with the saved config ({u,s,on:1}). Rejects with err.code on any problem;
   * in that case Google mode is NOT turned on and Trello data is untouched.
   */
  function connect(t, opts) {
    var app = opts.app;
    var url = cleanUrl(opts.url);
    var ro = { fetch: opts.fetch, timeout: opts.timeout };
    if (!isScriptUrl(url)) return Promise.reject(makeErr('URL'));
    var cfg;
    return getConfig(t).then(function (existing) {
      if (isOn(existing)) return existing;
      if (existing && existing.s && existing.u === url) return existing;
      // Never replace a key this board already has; only the link may change.
      var key = existing && existing.s ? existing.s : newSecret();
      return setConfig(t, { u: url, s: key }).then(function () {
        return getConfig(t); // if two people raced, use whichever key Trello kept
      }).then(function (saved) {
        if (!saved || !saved.s) throw makeErr('CONFIG_SAVE');
        return saved;
      });
    }).then(function (c) {
      cfg = c;
      if (isOn(cfg)) return { done: true };
      return ping(cfg.u, app, ro).then(function (p) {
        if (!(Number(p.v) >= 1)) throw makeErr('NOT_UPDATED');
        return claim(cfg.u, app, cfg.s, ro);
      }).then(function () {
        return get(cfg.u, app, cfg.s, ro);
      });
    }).then(function (remote) {
      if (remote.done) return cfg;
      if (remote.has && !remote.staged) {
        // Someone already moved this board's data to Google. Use it.
        return setConfig(t, { u: cfg.u, s: cfg.s, on: 1 });
      }
      return Promise.resolve(opts.readLocal()).then(function (local) {
        if (!local) {
          return setConfig(t, { u: cfg.u, s: cfg.s, on: 1 });
        }
        var body = String(local.body);
        var want = hash(body);
        var stagedRev;
        return put(cfg.u, app, cfg.s, body, remote.rev, true, ro).then(function (w) {
          stagedRev = w.rev;
          return get(cfg.u, app, cfg.s, ro);
        }).then(function (back) {
          var count = -1;
          try { count = opts.countOf ? opts.countOf(back.body) : local.count; } catch (e) { count = -1; }
          var ok = back.has && back.rev === stagedRev && back.body === body && back.hash === want && hash(back.body) === want && count === local.count;
          if (!ok) {
            return clear(cfg.u, app, cfg.s, back.rev, ro).catch(function () { return null; }).then(function () {
              throw makeErr('VERIFY');
            });
          }
          return commit(cfg.u, app, cfg.s, stagedRev, ro);
        }).then(function () {
          return setConfig(t, { u: cfg.u, s: cfg.s, on: 1 });
        });
      });
    });
  }

  // Point an already-moved board at a new script link (e.g. a new deployment of
  // the same script). Only switches if the new link already has this board's data.
  function changeUrl(t, cfg, newUrl, app, opts) {
    newUrl = cleanUrl(newUrl);
    if (!isOn(cfg) || !isScriptUrl(newUrl) || newUrl === cfg.u) return Promise.resolve(cfg);
    var next = { u: newUrl, s: cfg.s, on: 1 };
    return getWithClaim(next, app, opts).then(function (r) {
      if (!r.has) throw makeErr('NO_DATA');
      return setConfig(t, next);
    });
  }

  function errorMessage(err, appName) {
    var code = err && err.code;
    appName = appName || 'this app';
    if (code === 'NETWORK') return 'Could not reach Google storage. Check the internet connection and reopen ' + appName + '. Nothing was lost.';
    if (code === 'NOT_UPDATED') return 'Google storage is not ready: the Office Budget Email script needs the new code. Paste it, choose Deploy → Manage deployments → Edit → New version, then reopen ' + appName + '. Nothing was lost.';
    if (code === 'BAD_SECRET') return 'Google storage refused this board’s key. In the Apps Script editor, run resetDataAccess once, then reopen ' + appName + '. Nothing was lost.';
    if (code === 'CONFIG_SAVE') return 'Trello would not save the Google storage link on this board. Reopen ' + appName + ' and try again. Nothing was lost.';
    if (code === 'VERIFY') return 'The copy in Google did not match the Trello data, so ' + appName + ' kept using Trello. Reopen to try again. Nothing was lost.';
    if (code === 'CONFLICT') return 'Someone else just saved a change. Close and reopen ' + appName + ', then try again.';
    if (code === 'TOO_BIG') return 'Google storage is full for ' + appName + '. Nothing was saved.';
    if (code === 'NO_DATA') return 'That script link does not have this board’s data, so the old link was kept.';
    if (code === 'URL') return 'Paste the Apps Script web app link (https://script.google.com/…/exec).';
    return 'Google storage had a problem. Reopen ' + appName + ' and try again. Nothing was lost.';
  }

  // Lets Office Passwords find the script link that Office Budget already uses
  // (same github.io site). Only the link is shared, never the key.
  var LS_KEY = 'officeScriptUrl';
  function rememberUrl(u) {
    try { if (isScriptUrl(u) && root.localStorage) root.localStorage.setItem(LS_KEY, cleanUrl(u)); } catch (e) {}
  }
  function rememberedUrl() {
    try { var u = root.localStorage && root.localStorage.getItem(LS_KEY); return isScriptUrl(u) ? cleanUrl(u) : ''; } catch (e) { return ''; }
  }

  root.OfficeCloud = {
    PREFIX: PREFIX, CONFIG_KEY: CONFIG_KEY,
    cleanUrl: cleanUrl, isScriptUrl: isScriptUrl, hash: hash, newSecret: newSecret, makeErr: makeErr,
    request: request, ping: ping, claim: claim, get: get, put: put, commit: commit, clear: clear,
    parseConfig: parseConfig, isOn: isOn, getConfig: getConfig, setConfig: setConfig,
    getWithClaim: getWithClaim, connect: connect, changeUrl: changeUrl, errorMessage: errorMessage,
    rememberUrl: rememberUrl, rememberedUrl: rememberedUrl
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = root.OfficeCloud;
})(typeof globalThis !== 'undefined' ? globalThis : this);
