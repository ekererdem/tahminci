/* Tahminci simülasyon motoru: Dixon-Coles gol modeli + Monte Carlo.
   Hem uygulamada (WebView) hem de Node testlerinde çalışır. */
(function (root) {
  "use strict";

  // ---------- Rastgele sayı ve dağılımlar ----------
  function rng(seed) { // mulberry32: tekrarlanabilir, hızlı
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) | 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function poisson(r, mu) {
    if (mu <= 0) return 0;
    if (mu > 30) return Math.max(0, Math.round(mu + Math.sqrt(mu) * normal(r)));
    const L = Math.exp(-mu); let k = 0, p = 1;
    do { k++; p *= r(); } while (p > L);
    return k - 1;
  }
  function normal(r) { let u = 0, v = 0; while (u === 0) u = r(); v = r(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
  function gamma(r, k) { // Marsaglia-Tsang, ölçek 1
    if (k < 1) return gamma(r, k + 1) * Math.pow(r(), 1 / k);
    const d = k - 1 / 3, c = 1 / Math.sqrt(9 * d);
    for (;;) {
      let x, v;
      do { x = normal(r); v = 1 + c * x; } while (v <= 0);
      v = v * v * v; const u = r();
      if (u < 1 - 0.0331 * x * x * x * x) return d * v;
      if (Math.log(u) < 0.5 * x * x + d * (1 - v + Math.log(v))) return d * v;
    }
  }
  // Negatif binom (korner/kart: Poisson'dan daha dağınık) = Gamma-Poisson karışımı
  function negbin(r, mu, k) { return mu <= 0 ? 0 : poisson(r, gamma(r, k) * mu / k); }
  function binom(r, n, p) { let s = 0; for (let i = 0; i < n; i++) if (r() < p) s++; return s; }
  function poisPmf(k, mu) { let p = Math.exp(-mu); for (let i = 1; i <= k; i++) p *= mu / i; return p; }

  // ---------- Model ----------
  function glm(m, home, away) { // log(mu) = c + h + hücum + savunma
    if (!m) return null;
    const A = (t) => m.att[t] || 0, D = (t) => m.def[t] || 0;
    return [Math.exp(m.c + m.h + A(home) + D(away)), Math.exp(m.c + A(away) + D(home))];
  }
  function dcRates(L, home, away) {
    const dc = L.dc, A = (t) => dc.att[t] || 0, D = (t) => dc.def[t] || 0;
    return [Math.exp(dc.home + A(home) + D(away)), Math.exp(A(away) + D(home))];
  }
  function tau(x, y, lh, la, rho) {
    if (x === 0 && y === 0) return 1 - lh * la * rho;
    if (x === 0 && y === 1) return 1 + lh * rho;
    if (x === 1 && y === 0) return 1 + la * rho;
    if (x === 1 && y === 1) return 1 - rho;
    return 1;
  }
  function scoreMatrix(lh, la, rho, G) {
    G = G || 10; const m = []; let s = 0;
    for (let x = 0; x <= G; x++) { m.push([]); for (let y = 0; y <= G; y++) {
      const v = Math.max(0, poisPmf(x, lh) * poisPmf(y, la) * tau(x, y, lh, la, rho)); m[x].push(v); s += v; } }
    for (let x = 0; x <= G; x++) for (let y = 0; y <= G; y++) m[x][y] /= s;
    return m;
  }

  // Elle ayar: adj = {homeAtt, awayAtt} çarpanları (ör. 0.9 = %10 zayıf)
  function prematch(L, home, away, adj) {
    adj = adj || {};
    let [lh, la] = dcRates(L, home, away);
    // home/away: hücum gücü çarpanı · homeDef/awayDef: o takımın yediği gol çarpanı (eksik savunmacı = daha çok gol yer)
    lh *= (adj.home || 1) * (adj.awayDef || 1); la *= (adj.away || 1) * (adj.homeDef || 1);
    const ht = glm(L.ht, home, away), h2 = glm(L.h2, home, away);
    const share = ht && h2 ? [ht[0] / (ht[0] + h2[0]), ht[1] / (ht[1] + h2[1])] : [0.44, 0.44];
    return { lh, la, rho: L.dc.rho, share, corner: glm(L.corner, home, away), yellow: glm(L.yellow, home, away) };
  }

  function simulate(L, home, away, n, adj, seed) {
    n = n || 10000; const r = rng(seed || 42), P = prematch(L, home, away, adj);
    const M = scoreMatrix(P.lh, P.la, P.rho), G = M.length, cum = []; let c = 0;
    for (let x = 0; x < G; x++) for (let y = 0; y < G; y++) { c += M[x][y]; cum.push(c); }
    const S = { fh: new Int8Array(n), fa: new Int8Array(n), hh: new Int8Array(n), ha: new Int8Array(n),
                ch: new Int8Array(n), ca: new Int8Array(n), yh: new Int8Array(n), ya: new Int8Array(n) };
    for (let i = 0; i < n; i++) {
      const u = r(); let lo = 0, hi = cum.length - 1;
      while (lo < hi) { const mid = (lo + hi) >> 1; if (cum[mid] < u) lo = mid + 1; else hi = mid; }
      const x = Math.floor(lo / G), y = lo % G;
      S.fh[i] = x; S.fa[i] = y; S.hh[i] = binom(r, x, P.share[0]); S.ha[i] = binom(r, y, P.share[1]);
      if (P.corner) { S.ch[i] = negbin(r, P.corner[0], 8); S.ca[i] = negbin(r, P.corner[1], 8); }
      if (P.yellow) { S.yh[i] = negbin(r, P.yellow[0], 10); S.ya[i] = negbin(r, P.yellow[1], 10); }
    }
    return { n, P, S, matrix: M, hasCorner: !!P.corner, hasYellow: !!P.yellow };
  }

  function summarize(sim) {
    const { n, S } = sim, pct = (f) => { let k = 0; for (let i = 0; i < n; i++) if (f(i)) k++; return 100 * k / n; };
    const res = (h, a) => (h > a ? "1" : h === a ? "X" : "2");
    const scores = {}, htft = {};
    for (let i = 0; i < n; i++) {
      const s = S.fh[i] + "-" + S.fa[i]; scores[s] = (scores[s] || 0) + 1;
      const k = res(S.hh[i], S.ha[i]) + "/" + res(S.fh[i], S.fa[i]); htft[k] = (htft[k] || 0) + 1;
    }
    const top = (o, k) => Object.entries(o).sort((a, b) => b[1] - a[1]).slice(0, k).map(([s, c]) => [s, 100 * c / n]);
    const mean = (a, b) => { let s = 0; for (let i = 0; i < n; i++) s += a[i] + (b ? b[i] : 0); return s / n; };
    const out = {
      xg: [sim.P.lh, sim.P.la],
      ms: { "1": pct((i) => S.fh[i] > S.fa[i]), X: pct((i) => S.fh[i] === S.fa[i]), "2": pct((i) => S.fh[i] < S.fa[i]) },
      iy: { "1": pct((i) => S.hh[i] > S.ha[i]), X: pct((i) => S.hh[i] === S.ha[i]), "2": pct((i) => S.hh[i] < S.ha[i]) },
      scores: top(scores, 10), htft: top(htft, 9),
      goals: [0.5, 1.5, 2.5, 3.5, 4.5].map((l) => [l, pct((i) => S.fh[i] + S.fa[i] > l)]),
      htGoals: [0.5, 1.5, 2.5].map((l) => [l, pct((i) => S.hh[i] + S.ha[i] > l)]),
      homeGoals: [0.5, 1.5, 2.5].map((l) => [l, pct((i) => S.fh[i] > l)]),
      awayGoals: [0.5, 1.5, 2.5].map((l) => [l, pct((i) => S.fa[i] > l)]),
      btts: pct((i) => S.fh[i] > 0 && S.fa[i] > 0),
      firstGoal: { home: 0, none: pct((i) => S.fh[i] + S.fa[i] === 0), away: 0 },
      avgGoals: mean(S.fh, S.fa), matrix: sim.matrix,
    };
    // İlk golü kim atar: gol hızları oranına göre (yaklaşık)
    const sh = sim.P.lh / (sim.P.lh + sim.P.la); out.firstGoal.home = (100 - out.firstGoal.none) * sh; out.firstGoal.away = (100 - out.firstGoal.none) * (1 - sh);
    if (sim.hasCorner) {
      out.corners = { avg: [mean(S.ch), mean(S.ca)], total: mean(S.ch, S.ca),
        lines: [7.5, 8.5, 9.5, 10.5, 11.5, 12.5].map((l) => [l, pct((i) => S.ch[i] + S.ca[i] > l)]),
        more: { ev: pct((i) => S.ch[i] > S.ca[i]), esit: pct((i) => S.ch[i] === S.ca[i]), dep: pct((i) => S.ch[i] < S.ca[i]) } };
    }
    if (sim.hasYellow) {
      out.cards = { avg: [mean(S.yh), mean(S.ya)], total: mean(S.yh, S.ya),
        lines: [2.5, 3.5, 4.5, 5.5, 6.5].map((l) => [l, pct((i) => S.yh[i] + S.ya[i] > l)]) };
    }
    return out;
  }

  // ---------- Canlı mod ----------
  const LIVE = { K_GOAL: 45, K_CORNER: 60,
    STATE: { lead: 0.90, draw: 1.0, trail: 1.15 }, CSTATE: { lead: 0.90, draw: 1.0, trail: 1.15 },
    RED: { own: 0.70, opp: 1.25 } };
  function cprof(m) { return m >= 75 ? 1.20 : m >= 60 ? 1.02 : 0.93; }
  function profMin(a, b) { let s = 0; for (let m = a; m < b; m++) s += cprof(m + 0.5); return s; }
  function upd(pre90, obs, minute, K) { return (pre90 / 90 * K + obs) / (K + minute) * 90; }

  function live(L, home, away, st, n, seed) {
    // st = {minute, goals:[h,a], xg:[h,a]|null, corners:[h,a]|null, reds:[h,a], stoppage}
    n = n || 30000; const r = rng(seed || 7), P = prematch(L, home, away, st.adj);
    const minute = Math.min(st.minute, 95), stop = st.stoppage == null ? 5 : st.stoppage;
    const rem = Math.max(90 + stop - minute, 1), g = st.goals, reds = st.reds || [0, 0];
    const state = (i) => (g[i] > g[1 - i] ? "lead" : g[i] < g[1 - i] ? "trail" : "draw");
    const base = [P.lh, P.la];
    const gr = [0, 1].map((i) => {
      let v = st.xg ? upd(base[i], st.xg[i], minute, LIVE.K_GOAL) : base[i];
      v *= LIVE.STATE[state(i)] * Math.pow(LIVE.RED.own, reds[i]) * Math.pow(LIVE.RED.opp, reds[1 - i]);
      return v;
    });
    const full = profMin(0, 93), effPlayed = profMin(0, minute) * 90 / full, fc = profMin(minute, 90 + stop) / full;
    const cr = P.corner ? [0, 1].map((i) => {
      let v = st.corners ? upd(P.corner[i], st.corners[i], effPlayed, LIVE.K_CORNER) : P.corner[i];
      return v * LIVE.CSTATE[state(i)];
    }) : null;
    const f = rem / 90, S = { gh: new Int8Array(n), ga: new Int8Array(n), ch: new Int8Array(n), ca: new Int8Array(n) };
    const c0 = st.corners || [0, 0];
    for (let i = 0; i < n; i++) {
      S.gh[i] = g[0] + poisson(r, gr[0] * f); S.ga[i] = g[1] + poisson(r, gr[1] * f);
      if (cr) { S.ch[i] = c0[0] + negbin(r, cr[0] * fc, 8); S.ca[i] = c0[1] + negbin(r, cr[1] * fc, 8); }
    }
    return { n, S, rem, pre: { goal: base, corner: P.corner }, now: { goal: gr, corner: cr }, hasCorner: !!cr };
  }

  // Pazar olasılıkları (Bilyoner adlarıyla)
  function liveMarkets(sim) {
    const { n, S } = sim, P = (f) => { let k = 0; for (let i = 0; i < n; i++) if (f(i)) k++; return k / n; };
    const out = {
      "Maç Sonucu": { "1": P((i) => S.gh[i] > S.ga[i]), X: P((i) => S.gh[i] === S.ga[i]), "2": P((i) => S.gh[i] < S.ga[i]) },
      "Karşılıklı Gol": { Var: P((i) => S.gh[i] > 0 && S.ga[i] > 0), Yok: P((i) => !(S.gh[i] > 0 && S.ga[i] > 0)) },
    };
    const ms = out["Maç Sonucu"]; out["Çifte Şans"] = { "1X": ms["1"] + ms.X, "12": ms["1"] + ms["2"], X2: ms.X + ms["2"] };
    const lines = (name, f, from, to) => { for (let l = from; l <= to; l++) out[name + " " + l + ",5"] = { Alt: P((i) => f(i) <= l), "Üst": P((i) => f(i) > l) }; };
    lines("Gol", (i) => S.gh[i] + S.ga[i], 0, 8); lines("Ev Gol", (i) => S.gh[i], 0, 6); lines("Dep Gol", (i) => S.ga[i], 0, 6);
    if (sim.hasCorner) {
      lines("Korner", (i) => S.ch[i] + S.ca[i], 2, 20); lines("Ev Korner", (i) => S.ch[i], 0, 14); lines("Dep Korner", (i) => S.ca[i], 0, 14);
      out["Daha Fazla Korner"] = { Ev: P((i) => S.ch[i] > S.ca[i]), "Eşit": P((i) => S.ch[i] === S.ca[i]), Dep: P((i) => S.ch[i] < S.ca[i]) };
    }
    return out;
  }
  // Maç öncesi simülasyondan aynı pazarlar (oran karşılaştırması için)
  function preMarkets(sim) {
    const s = { n: sim.n, S: { gh: sim.S.fh, ga: sim.S.fa, ch: sim.S.ch, ca: sim.S.ca }, hasCorner: sim.hasCorner };
    const out = liveMarkets(s), S = sim.S, n = sim.n, P = (f) => { let k = 0; for (let i = 0; i < n; i++) if (f(i)) k++; return k / n; };
    out["İlk Yarı Sonucu"] = { "1": P((i) => S.hh[i] > S.ha[i]), X: P((i) => S.hh[i] === S.ha[i]), "2": P((i) => S.hh[i] < S.ha[i]) };
    const r = (h, a) => (h > a ? "1" : h === a ? "X" : "2"), hf = {};
    for (const a of ["1", "X", "2"]) for (const b of ["1", "X", "2"]) hf[a + "/" + b] = 0;
    for (let i = 0; i < n; i++) hf[r(S.hh[i], S.ha[i]) + "/" + r(S.fh[i], S.fa[i])] += 1 / n;
    out["İY/MS"] = hf;
    for (let l = 0; l <= 3; l++) out["İY Gol " + l + ",5"] = { Alt: P((i) => S.hh[i] + S.ha[i] <= l), "Üst": P((i) => S.hh[i] + S.ha[i] > l) };
    return out;
  }

  // Oranlarla karşılaştır: kesintiyi çıkarıp "adil" olasılık, model olasılığı, beklenen getiri
  function compare(model, odds) {
    const rows = [];
    for (const mk in odds) {
      if (!model[mk]) continue;
      const opts = odds[mk], raw = {}; let margin = 0, open = 0;
      for (const k in opts) if (opts[k]) { raw[k] = 1 / opts[k]; margin += raw[k]; open++; }
      const full = open === Object.keys(model[mk]).length && open > 1;
      const total = mk === "Çifte Şans" ? 2 : 1;   // çifte şansta olasılıklar toplamı 2
      for (const k in opts) {
        const o = opts[k]; if (!o || model[mk][k] == null) continue;
        const p = model[mk][k];
        rows.push({ market: mk, pick: k, odd: o, model: p, raw: raw[k], fair: full ? raw[k] * total / margin : null,
                    margin: full ? margin / total - 1 : null, ev: p * o - 1 });
      }
    }
    return rows.sort((a, b) => b.ev - a.ev);
  }

  // Bir bahsin gerçek sonuca göre tutup tutmadığı. r = {fh,fa,hh,ha,ch,ca}; bilinmiyorsa null
  function settle(mk, pick, r) {
    const res = (a, b) => (a > b ? "1" : a === b ? "X" : "2");
    const ou = (v, line) => (v == null ? null : pick === "Alt" ? v < line : v > line);
    const t = r.fh + r.fa; let m;
    if (mk === "Maç Sonucu") return res(r.fh, r.fa) === pick;
    if (mk === "Çifte Şans") return pick.includes(res(r.fh, r.fa)) || (pick === "12" && r.fh !== r.fa);
    if (mk === "Karşılıklı Gol") return (r.fh > 0 && r.fa > 0) === (pick === "Var");
    if (mk === "İlk Yarı Sonucu") return r.hh == null ? null : res(r.hh, r.ha) === pick;
    if (mk === "İY/MS") return r.hh == null ? null : res(r.hh, r.ha) + "/" + res(r.fh, r.fa) === pick;
    if ((m = mk.match(/^Gol (\d+),5$/))) return ou(t, +m[1] + 0.5);
    if ((m = mk.match(/^İY Gol (\d+),5$/))) return r.hh == null ? null : ou(r.hh + r.ha, +m[1] + 0.5);
    if ((m = mk.match(/^Ev Gol (\d+),5$/))) return ou(r.fh, +m[1] + 0.5);
    if ((m = mk.match(/^Dep Gol (\d+),5$/))) return ou(r.fa, +m[1] + 0.5);
    if ((m = mk.match(/^Korner (\d+),5$/))) return r.ch == null ? null : ou(r.ch + r.ca, +m[1] + 0.5);
    if ((m = mk.match(/^Ev Korner (\d+),5$/))) return ou(r.ch, +m[1] + 0.5);
    if ((m = mk.match(/^Dep Korner (\d+),5$/))) return ou(r.ca, +m[1] + 0.5);
    if (mk === "Daha Fazla Korner") return r.ch == null ? null : (pick === "Ev" ? r.ch > r.ca : pick === "Dep" ? r.ch < r.ca : r.ch === r.ca);
    return null;
  }

  const api = { settle, simulate, summarize, live, liveMarkets, preMarkets, compare, prematch, scoreMatrix, LIVE };
  if (typeof module !== "undefined") module.exports = api; else root.Engine = api;
})(this);
