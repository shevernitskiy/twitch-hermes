// ==UserScript==
// @name         Twitch Hermes Sniffer
// @namespace    twitch-hermes-sniffer
// @version      0.1.2
// @description  Logs incoming/outgoing Twitch Hermes WebSocket messages and keeps a catalog of topics / event types / field types to spot new or changed events
// @match        https://www.twitch.tv/*
// @match        https://m.twitch.tv/*
// @match        https://dashboard.twitch.tv/*
// @run-at       document-start
// @grant        none
// ==/UserScript==

(() => {
  "use strict";

  const HERMES_RE = /^wss:\/\/hermes\.twitch\.tv\//;
  const MAX_LOG = 5000; // messages kept in memory
  const MAX_PATHS = 400; // field paths per catalog entry
  const MAX_SAMPLE_CHARS = 20000;
  const CATALOG_KEY = "hermesSniffer.catalog.v1";
  const SECRET_KEY_RE = /token|authorization|oauth|password/i;

  const state = {
    log: [],
    n: 0,
    sockets: 0,
    keepalives: 0,
    subs: new Map(), // `${sock}:${id}` -> topic
    // inner event types that go to the catalog only (counts, fields, sample): not printed, not kept in the log buffer
    quiet: new Set(["viewcount"]),
    quietCount: 0,
    mute: new Set(), // labels that are stored in the log but not printed, e.g. "video-playback-by-id.123 viewcount"
    seenWsUrls: new Set(),
  };

  // ---------- catalog (persisted across sessions) ----------

  const loadCatalog = () => {
    try {
      return JSON.parse(localStorage.getItem(CATALOG_KEY) || "{}");
    } catch {
      return {};
    }
  };
  const catalog = loadCatalog();
  let dirty = false;

  // count of each entry as of the last load/flush, so only this tab's delta is added to the shared copy
  const flushedCount = new Map(Object.entries(catalog).map(([k, e]) => [k, e.count]));

  const mergeInto = (s, e, delta) => {
    s.count += delta;
    if (e.firstSeen < s.firstSeen) s.firstSeen = e.firstSeen;
    if (e.lastSeen > s.lastSeen) s.lastSeen = e.lastSeen;
    for (const [p, types] of Object.entries(e.fields)) {
      const known = (s.fields[p] ??= []);
      for (const t of types) if (!known.includes(t)) known.push(t);
    }
    if (e.sampleLen > s.sampleLen) {
      s.sample = e.sample;
      s.sampleLen = e.sampleLen;
    }
  };

  // several tabs share one localStorage copy: read it, merge our changes in, write back,
  // then adopt the merged result (this also pulls in what other tabs found)
  const flush = () => {
    if (!dirty) return;
    try {
      const stored = loadCatalog();
      for (const [key, e] of Object.entries(catalog)) {
        const delta = e.count - (flushedCount.get(key) ?? 0);
        if (stored[key]) mergeInto(stored[key], e, delta);
        else stored[key] = e;
      }
      localStorage.setItem(CATALOG_KEY, JSON.stringify(stored));
      for (const [key, e] of Object.entries(stored)) {
        catalog[key] = e;
        flushedCount.set(key, e.count);
      }
      dirty = false;
    } catch (e) {
      console.warn("[hermes] cannot persist catalog", e);
    }
  };
  setInterval(flush, 5000);
  addEventListener("pagehide", flush);

  const addType = (out, path, t) => {
    const arr = (out[path] ??= []);
    if (!arr.includes(t)) arr.push(t);
  };

  // path -> [types]; arrays: first 3 items as `path[]`, huge maps collapsed to `path.{*}`
  const flatten = (v, path, out) => {
    if (Object.keys(out).length > MAX_PATHS) return;
    const t = v === null ? "null" : Array.isArray(v) ? "array" : typeof v;
    addType(out, path || "$", t);
    if (t === "array") {
      for (const item of v.slice(0, 3)) flatten(item, path + "[]", out);
    } else if (t === "object") {
      const keys = Object.keys(v);
      if (keys.length > 40) {
        addType(out, path + ".{*}", "map");
        flatten(v[keys[0]], path + ".{*}", out);
      } else {
        for (const k of keys) flatten(v[k], path ? `${path}.${k}` : k, out);
      }
    }
  };

  const record = (base, type, payload) => {
    const key = `${base}|${type}`;
    const fields = {};
    flatten(payload, "", fields);
    const now = new Date().toISOString();
    const sampleLen = JSON.stringify(payload ?? null).length;
    let e = catalog[key];

    if (!e) {
      e = catalog[key] = {
        base,
        type,
        count: 0,
        firstSeen: now,
        lastSeen: now,
        fields,
        sampleLen: 0,
        sample: null,
      };
      console.info(`%c[hermes] NEW event: ${key}`, "color:#2f9e44;font-weight:bold", payload);
    } else {
      for (const [p, types] of Object.entries(fields)) {
        const known = e.fields[p];
        if (!known) {
          e.fields[p] = types;
          console.warn(`[hermes] ${key}: NEW FIELD ${p} (${types.join("|")})`);
        } else {
          for (const t of types) {
            if (!known.includes(t)) {
              known.push(t);
              console.warn(`[hermes] ${key}: field ${p} got new type "${t}" (was ${known.slice(0, -1).join("|")})`);
            }
          }
        }
      }
    }

    // keep the largest sample (more fields filled in than a sample full of nulls)
    if (sampleLen > e.sampleLen && sampleLen <= MAX_SAMPLE_CHARS) {
      e.sample = payload;
      e.sampleLen = sampleLen;
    }
    e.count++;
    e.lastSeen = now;
    dirty = true;
  };

  // ---------- helpers ----------

  const tryParse = (s) => {
    try {
      return JSON.parse(s);
    } catch {
      return undefined;
    }
  };

  const redact = (v) => {
    if (v && typeof v === "object") {
      for (const k of Object.keys(v)) {
        if (SECRET_KEY_RE.test(k) && typeof v[k] === "string") v[k] = "[redacted]";
        else redact(v[k]);
      }
    }
    return v;
  };

  const push = (entry) => {
    entry.n = ++state.n;
    entry.t = new Date().toISOString();
    state.log.push(entry);
    if (state.log.length > MAX_LOG + 500) state.log.splice(0, state.log.length - MAX_LOG);
  };

  const print = (e) => {
    if (state.mute.has(e.label)) return;
    const arrow = e.dir === "in" ? "←" : e.dir === "out" ? "→" : "•";
    const color = e.dir === "in" ? "#9146ff" : e.dir === "out" ? "#e8590c" : "#868e96";
    console.log(`%c[hermes #${e.sock}] ${arrow} ${e.label}`, `color:${color}`, e.inner ?? e.msg ?? e.info ?? "");
  };

  // ---------- message handling ----------

  const handle = (dir, sock, raw) => {
    const msg = typeof raw === "string" ? tryParse(raw) : undefined;
    if (!msg || typeof msg !== "object") {
      const e = {
        sock,
        dir,
        label: "(non-json)",
        raw: typeof raw === "string" ? raw : Object.prototype.toString.call(raw),
      };
      push(e);
      print(e);
      return;
    }
    redact(msg);
    const type = msg.type ?? "?";

    if (type === "keepalive") {
      state.keepalives++;
      return;
    }

    const entry = { sock, dir, label: type, msg };

    // remember which subscription id belongs to which topic
    // NOTE: field names follow your old types; verify on the first run
    if (dir === "out" && type === "subscribe") {
      const topic = msg.subscribe?.pubsub?.topic ?? "?";
      if (msg.subscribe?.id) state.subs.set(`${sock}:${msg.subscribe.id}`, topic);
      if (msg.id) state.subs.set(`${sock}:msg:${msg.id}`, topic);
      entry.topic = topic;
      entry.label = `subscribe ${topic}`;
    } else if (dir === "in" && type === "subscribeResponse") {
      const sr = msg.subscribeResponse ?? {};
      const topic =
        state.subs.get(`${sock}:${sr.subscription?.id}`) ?? state.subs.get(`${sock}:msg:${msg.parentId}`) ?? "?";
      if (sr.subscription?.id) state.subs.set(`${sock}:${sr.subscription.id}`, topic);
      sr.topic = topic; // same enrichment as in your types ("not original field")
      entry.topic = topic;
      entry.label = `subscribeResponse ${topic} (${sr.result ?? "?"})`;
    }

    if (dir === "in" && type === "notification") {
      const n = msg.notification ?? {};
      if (n.type === "pubsub") {
        const topic = state.subs.get(`${sock}:${n.subscription?.id}`) ?? "?";
        const inner = typeof n.pubsub === "string" ? tryParse(n.pubsub) : n.pubsub;
        if (inner && typeof inner.data === "string") {
          const d = tryParse(inner.data);
          if (d !== undefined) inner.data = d;
        }
        entry.topic = topic;
        entry.inner = inner;
        entry.label = `${topic} ${inner?.type ?? "(no type)"}`;
        record(topic.split(".")[0], inner?.type ?? "(no type)", inner);
        if (state.quiet.has(inner?.type)) {
          state.quietCount++;
          return;
        }
      } else {
        entry.label = `notification:${n.type ?? "?"}`;
        record("_notification", n.type ?? "?", n);
      }
    } else {
      record(`_${dir}`, type, msg);
    }

    push(entry);
    print(entry);
  };

  const sys = (sock, event, info) => {
    const e = { sock, dir: "sys", label: event, info };
    push(e);
    print(e);
  };

  const attach = (ws, url) => {
    const sock = ++state.sockets;
    sys(sock, "construct", { url });
    ws.addEventListener("open", () => sys(sock, "open"));
    ws.addEventListener("close", (ev) =>
      sys(sock, "close", {
        code: ev.code,
        reason: ev.reason,
        wasClean: ev.wasClean,
      }),
    );
    ws.addEventListener("error", () => sys(sock, "error"));
    ws.addEventListener("message", (ev) => {
      try {
        handle("in", sock, ev.data);
      } catch (e) {
        console.error("[hermes] handle(in) failed", e);
      }
    });
    const nativeSend = ws.send;
    ws.send = function (data) {
      try {
        handle("out", sock, data);
      } catch (e) {
        console.error("[hermes] handle(out) failed", e);
      }
      return nativeSend.call(this, data);
    };
  };

  // ---------- WebSocket hook ----------

  const NativeWS = window.WebSocket;
  window.WebSocket = new Proxy(NativeWS, {
    construct(target, args, newTarget) {
      const ws = Reflect.construct(target, args, newTarget);
      try {
        const url = String(args[0]);
        if (HERMES_RE.test(url)) {
          attach(ws, url);
        } else {
          const host = url.split("?")[0];
          if (!state.seenWsUrls.has(host)) {
            state.seenWsUrls.add(host);
            console.log(`[hermes] other websocket seen: ${host}`);
          }
        }
      } catch (e) {
        console.error("[hermes] hook failed", e);
      }
      return ws;
    },
  });

  // ---------- public API ----------

  const save = (name, text, mime) => {
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([text], { type: mime }));
    a.download = name;
    document.body.append(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  };

  const stamp = () => new Date().toISOString().replace(/[:.]/g, "-");

  const api = {
    state,
    catalog,
    /** event types hidden from console and log buffer, still counted in the catalog: __hermes.quiet.add("polls") */
    quiet: state.quiet,
    get log() {
      return state.log;
    },
    /** download message log (JSONL) and/or catalog (JSON) */
    download(what = "both") {
      if (what === "log" || what === "both") {
        save(`hermes-log-${stamp()}.jsonl`, state.log.map((e) => JSON.stringify(e)).join("\n"), "application/x-ndjson");
      }
      if (what === "catalog" || what === "both") {
        save(`hermes-catalog-${stamp()}.json`, JSON.stringify(catalog, null, 2), "application/json");
      }
    },
    /** table of all seen (topic, event type) pairs */
    summary() {
      console.table(
        Object.values(catalog)
          .map((e) => ({
            base: e.base,
            type: e.type,
            count: e.count,
            fields: Object.keys(e.fields).length,
            firstSeen: e.firstSeen,
            lastSeen: e.lastSeen,
          }))
          .sort((a, b) => a.base.localeCompare(b.base) || a.type.localeCompare(b.type)),
      );
    },
    /** full topics the web client subscribed to in this session */
    topics() {
      return [...new Set(state.subs.values())].filter((t) => t !== "?").sort();
    },
    /** topic bases seen in subscribe messages that are absent from your known lists */
    unknownTopics(...knownLists) {
      const known = new Set(knownLists.flat());
      return [...new Set(api.topics().map((t) => t.split(".")[0]))].filter((b) => !known.has(b));
    },
    /** don't print these labels (still stored), e.g. api.mute("video-playback-by-id.123 viewcount") */
    mute(...labels) {
      labels.forEach((l) => state.mute.add(l));
    },
    clear() {
      state.log.length = 0;
    },
    resetCatalog() {
      for (const k of Object.keys(catalog)) delete catalog[k];
      flushedCount.clear();
      dirty = false;
      try {
        localStorage.removeItem(CATALOG_KEY);
      } catch {}
    },
  };
  window.__hermes = api;

  addEventListener("keydown", (ev) => {
    if (ev.altKey && ev.shiftKey && ev.code === "KeyH") api.download("both");
  });

  console.log("[hermes] sniffer ready: __hermes.summary() / .download() / .topics(); hotkey Alt+Shift+H = download");
})();
