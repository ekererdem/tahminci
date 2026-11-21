/* Bilyoner maç kartı sayfasının metninden (document.body.innerText) maç durumu ve oranları çıkarır. */
(function (root) {
  "use strict";
  const TR = { "İ": "i", "I": "i", "ı": "i", "Ş": "s", "ş": "s", "Ğ": "g", "ğ": "g", "Ü": "u", "ü": "u", "Ö": "o", "ö": "o", "Ç": "c", "ç": "c",
               "é": "e", "è": "e", "á": "a", "í": "i", "ó": "o", "ñ": "n", "ã": "a" };
  const STOP = new Set(["fk", "sk", "as", "jk", "fc", "cf", "afc", "ac", "sc", "us", "ssc", "the", "kulubu", "spor", "bb", "club", "de", "cd", "rc", "ud", "sd", "ca", "1", "ogc", "losc", "vfb", "vfl", "tsg", "sv", "bsc", "1fc"]);
  function norm(s) {
    s = String(s).replace(/[İIıŞşĞğÜüÖöÇçéèáíóñã]/g, (c) => TR[c] || c).toLowerCase().replace(/[^a-z0-9 ]/g, " ");
    return s.split(/\s+/).filter((w) => w && !STOP.has(w)).join(" ");
  }
  // Bilyoner adı -> football-data adı (sık kullanılan farklı yazımlar)
  const ALIAS = {
    "basaksehir": "Buyuksehyr", "rams basaksehir": "Buyuksehyr", "istanbul basaksehir": "Buyuksehyr", "goztepe": "Goztep",
    "caykur rize": "Rizespor", "caykur rizespor": "Rizespor", "rize": "Rizespor", "corum": "Corum", "erzurum": "Erzurumspor",
    "gaziantep": "Gaziantep", "kocaeli": "Kocaelispor", "amed": "Amedspor", "eyup": "Eyupspor", "kasimpasa": "Kasimpasa",
    "fatih karagumruk": "Karagumruk", "karagumruk": "Karagumruk", "kayseri": "Kayserispor", "antalya": "Antalyaspor",
    "manchester united": "Man United", "manchester city": "Man City", "nottingham forest": "Nott'm Forest", "wolverhampton": "Wolves",
    "wolverhampton wanderers": "Wolves", "tottenham": "Tottenham", "tottenham hotspur": "Tottenham", "newcastle united": "Newcastle",
    "west ham united": "West Ham", "brighton": "Brighton", "brighton hove albion": "Brighton", "leeds united": "Leeds",
    "sheffield united": "Sheffield United", "leicester city": "Leicester", "ipswich town": "Ipswich",
    "atletico madrid": "Ath Madrid", "athletic bilbao": "Ath Bilbao", "athletic club": "Ath Bilbao", "real betis": "Betis",
    "real sociedad": "Sociedad", "rayo vallecano": "Vallecano", "celta vigo": "Celta", "espanyol": "Espanol", "deportivo alaves": "Alaves",
    "real oviedo": "Oviedo", "inter": "Inter", "internazionale": "Inter", "hellas verona": "Verona", "ac milan": "Milan",
    "bayern munih": "Bayern Munich", "bayern munchen": "Bayern Munich", "bayern munich": "Bayern Munich", "borussia dortmund": "Dortmund",
    "bayer leverkusen": "Leverkusen", "borussia monchengladbach": "M'gladbach", "monchengladbach": "M'gladbach",
    "eintracht frankfurt": "Ein Frankfurt", "leipzig": "RB Leipzig", "koln": "FC Koln", "mainz": "Mainz", "mainz 05": "Mainz",
    "union berlin": "Union Berlin", "werder bremen": "Werder Bremen", "hoffenheim": "Hoffenheim", "hamburg": "Hamburg", "st pauli": "St Pauli",
    "paris saint germain": "Paris SG", "psg": "Paris SG", "saint etienne": "St Etienne", "olympique marsilya": "Marseille", "marsilya": "Marseille",
    "not forest": "Nott'm Forest", "leeds utd": "Leeds", "man utd": "Man United", "man city": "Man City", "west ham": "West Ham",
    "psv eindhoven": "PSV Eindhoven", "psv": "PSV Eindhoven", "ajax amsterdam": "Ajax", "feyenoord rotterdam": "Feyenoord", "az alkmaar": "AZ Alkmaar",
    "sporting lizbon": "Sp Lisbon", "sporting": "Sp Lisbon", "sporting cp": "Sp Lisbon", "benfica": "Benfica", "porto": "Porto", "sporting braga": "Braga", "braga": "Braga",
    "vitoria guimaraes": "Guimaraes", "club brugge": "Club Brugge", "royal antwerp": "Antwerp", "anderlecht": "Anderlecht", "genk": "Genk", "union saint gilloise": "St. Gilloise",
    "olympiakos": "Olympiakos", "olympiacos": "Olympiakos", "panathinaikos": "Panathinaikos", "aek atina": "AEK", "aek athens": "AEK", "paok": "PAOK",
    "celtic": "Celtic", "rangers": "Rangers", "glasgow rangers": "Rangers", "hearts": "Hearts", "heart of midlothian": "Hearts", "hibernian": "Hibernian",
    "olympique lyon": "Lyon", "lyon": "Lyon", "monaco": "Monaco", "lille": "Lille", "nice": "Nice", "lens": "Lens", "rennes": "Rennes", "brest": "Brest",
  };

  function teamIndex(R) {
    const all = [];
    for (const code in R.leagues) for (const t of R.leagues[code].teams) all.push({ code, team: t, n: norm(t) });
    return all;
  }
  // Bir satırı bilinen takımla eşleştir; bulamazsa null
  function matchTeam(line, idx) {
    const n = norm(line); if (!n || n.length < 3 || /^\d/.test(n)) return null;
    const alias = ALIAS[n] || ALIAS[n.replace(/ spor$/, "")];
    if (alias) { const f = idx.find((x) => x.team === alias); if (f) return f; }
    let best = null, bs = 0;
    for (const x of idx) {
      let s = 0;
      if (x.n === n) s = 1;
      else if (n.startsWith(x.n) || x.n.startsWith(n)) s = 0.85 * Math.min(n.length, x.n.length) / Math.max(n.length, x.n.length) + 0.1;
      else { const a = n.split(" "), b = x.n.split(" "); const common = a.filter((w) => w.length > 2 && b.includes(w)).length;
             if (common) s = 0.6 * common / Math.max(a.length, b.length); }
      if (s > bs) { bs = s; best = x; }
    }
    return bs >= 0.5 ? best : null;
  }

  const NUM = /^\d+(\.\d+)?$/;
  const isOdd = (s) => /^\d+\.\d{2}$/.test(s) || s === "—" || s === "-";
  const MARKETS = {
    "Maç Sonucu": { key: () => "Maç Sonucu", pick: { "MS 1": "1", "MS X": "X", "MS 2": "2" } },
    "Karşılıklı Gol": { key: () => "Karşılıklı Gol", pick: { "KG Var": "Var", "KG Yok": "Yok" } },
    "Toplam Gol Alt/Üst": { line: "Gol" }, "Alt/Üst": { line: "Gol" }, "Ev Sahibi Gol Alt/Üst": { line: "Ev Gol" },
    "Deplasman Gol Alt/Üst": { line: "Dep Gol" }, "Toplam Korner Alt/Üst": { line: "Korner" }, "Korner Alt/Üst": { line: "Korner" },
    "Ev Sahibi Korner Alt/Üst": { line: "Ev Korner" }, "Deplasman Korner Alt/Üst": { line: "Dep Korner" },
    "Hangi Takım Daha Fazla Korner Kullanır?": { key: () => "Daha Fazla Korner", pick: { "Ev": "Ev", "Eşit": "Eşit", "Dep": "Dep" } },
    "İlk Yarı Sonucu": { key: () => "İlk Yarı Sonucu", pick: { "İY 1": "1", "İY X": "X", "İY 2": "2", "1.Y 1": "1", "1.Y X": "X", "1.Y 2": "2", "1": "1", "X": "X", "2": "2" } },
    "Çifte Şans": { key: () => "Çifte Şans", pick: { "ÇŞ 1-X": "1X", "ÇŞ 1-2": "12", "ÇŞ X-2": "X2" } },
    "İlk Yarı / Maç Sonucu": { key: () => "İY/MS", pick: Object.fromEntries(["1", "X", "2"].flatMap((a) => ["1", "X", "2"].map((b) => [a + "/" + b, a + "/" + b]))) },
    "İlk Yarı Alt/Üst": { line: "İY Gol" }, "İlk Yarı Gol Alt/Üst": { line: "İY Gol" }, "İlk Yarı Toplam Gol Alt/Üst": { line: "İY Gol" },
  };

  function parse(text, R) {
    const L = String(text).split("\n").map((s) => s.trim()).filter(Boolean);
    const idx = teamIndex(R);
    // --- Başlık: ilk "Oranlar" sekmesine kadar olan bölümde takımları bul
    let end = L.indexOf("Oranlar"); if (end < 0) end = Math.min(L.length, 250);
    let start = Math.max(0, L.lastIndexOf("Şans Oyunları", end) + 1);
    const head = L.slice(start, end), found = [];
    head.forEach((s, i) => { const m = matchTeam(s, idx); if (m && !found.some((f) => f.m.team === m.team)) found.push({ i, m }); });
    const st = { ok: false, live: false };
    if (found.length >= 2) {
      const [h, a] = found;
      st.home = h.m.team; st.away = a.m.team; st.league = h.m.code; st.homeLabel = head[h.i]; st.awayLabel = head[a.i];
      st.leagueMismatch = h.m.code !== a.m.code;
      const mid = head.slice(h.i + 1, a.i), after = head.slice(a.i + 1);
      const mi = mid.findIndex((s) => /^\d+(\+\d+)?'$/.test(s) || s === "İY" || s === "DA" || s === "Devre Arası");
      if (mi >= 0) {
        st.live = true;
        const ms = mid[mi];
        st.minute = ms === "İY" || ms === "DA" || ms === "Devre Arası" ? 45 : ms.includes("+") ? parseInt(ms) + parseInt(ms.split("+")[1]) : parseInt(ms);
        st.halftime = !/'$/.test(ms);
        const sc = mid.slice(mi + 1).filter((s) => NUM.test(s));
        st.goals = [parseInt(sc[0]), parseInt(sc[1])];
        const hs = mid.slice(0, mi), as = after;
        const stats = (arr) => { const v = arr.filter((s) => NUM.test(s) || /^%\d+$/.test(s)); return v.length >= 4 ? v : null; };
        const H = stats(hs), A = stats(as);
        if (H && A) {
          st.xg = [parseFloat(H[0]), parseFloat(A[0])]; st.corners = [parseInt(H[1]), parseInt(A[1])];
          st.yellows = [parseInt(H[2]), parseInt(A[2])]; st.reds = [parseInt(H[3]), parseInt(A[3])];
          if (!/\./.test(H[0]) && !/\./.test(A[0])) { // bu maçta xG gösterilmiyor
            st.xg = null; st.corners = [parseInt(H[0]), parseInt(A[0])]; st.yellows = [parseInt(H[1]), parseInt(A[1])]; st.reds = [parseInt(H[2]), parseInt(A[2])]; }
        }
        if (!st.reds) st.reds = [0, 0];
      }
      st.ok = true;
    }
    // --- Oranlar: "oran \n etiket" çiftleri, başlıklar arasında
    const odds = {}; let cur = null;
    for (let i = 0; i < L.length; i++) {
      const x = L[i], prev = i > 0 ? L[i - 1] : "";
      if (!isOdd(x) && !isOdd(prev)) { cur = MARKETS[x] || null; continue; } // başlık
      if (!cur || isOdd(x) || !isOdd(prev)) continue;
      const o = prev === "—" || prev === "-" ? null : parseFloat(prev);
      if (cur.pick) {
        if (cur.pick[x] != null) (odds[cur.key()] = odds[cur.key()] || {})[cur.pick[x]] = o;
      } else {
        const m = x.match(/(\d+,5)\s*(Alt|Üst)$/);
        if (m) (odds[cur.line + " " + m[1]] = odds[cur.line + " " + m[1]] || {})[m[2]] = o;
      }
    }
    return { state: st, odds };
  }

  // Bir takımın Bilyoner listesinde nasıl yazılabileceği (normalize edilmiş biçimler)
  function keysFor(team) {
    const k = new Set([norm(team)]);
    for (const a in ALIAS) if (ALIAS[a] === team) k.add(a);
    return [...k].filter((x) => x.length >= 3);
  }
  // Bilyoner listesinde (maç öncesi ya da canlı) iki takımı arayan kod: kaydırarak tarar, bulunca maça gider.
  function finderCode(hk, ak) {
    return `(function(){
      var TR=${JSON.stringify(TR)}, STOP=${JSON.stringify([...STOP])}, HK=${JSON.stringify(hk)}, AK=${JSON.stringify(ak)};
      function norm(s){s=String(s).replace(/[İIıŞşĞğÜüÖöÇçéèáíóñã]/g,function(c){return TR[c]||c}).toLowerCase().replace(/[^a-z0-9 ]/g,' ');
        return s.split(/\\s+/).filter(function(w){return w&&STOP.indexOf(w)<0}).join(' ');}
      function hit(n,keys){if(/(^| )(u\\d\\d|b|c|ii|iii|kadin|women|res|reserves)( |$)/.test(n))return false;for(var i=0;i<keys.length;i++){var k=keys[i];if(n===k||(n.length>=4&&(k.indexOf(n)===0||n.indexOf(k)===0)))return true;}return false;}
      window.__tf={state:'tarıyor',seen:0};
      var sel='a.event-row-prematch__cells__teams, .event-row-live__title__teams__names, a[href*="/mac-karti/futbol/"]';
      function look(){var els=document.querySelectorAll(sel);window.__tf.seen=Math.max(window.__tf.seen,els.length);
        for(var i=0;i<els.length;i++){var e=els[i];var t=(e.getAttribute('title')||e.textContent||'').replace(/\\s+/g,' ');
          var p=t.split(' - ');if(p.length<2)continue;
          if(hit(norm(p[0]),HK)&&hit(norm(p.slice(1).join(' - ')),AK)){
            var h=e.getAttribute('href');window.__tf={state:'bulundu',title:t.trim()};
            if(h){location.href=h;}else{e.click();}return true;}}return false;}
      var sc=document.querySelector('.events-container__content');
      while(sc&&!(sc.scrollHeight>sc.clientHeight+50&&/(auto|scroll)/.test(getComputedStyle(sc).overflowY)))sc=sc.parentElement;
      var tg=sc||document.scrollingElement,last=-1,steps=0;
      tg.scrollTop=0;
      (function step(){if(look())return;
        if(steps>450||(tg.scrollTop===last&&steps>3)){window.__tf={state:'yok'};return;}
        last=tg.scrollTop;tg.scrollTop+=tg.clientHeight*0.85;steps++;setTimeout(step,90);})();
      return 'başladı';})()`;
  }

  const api = { parse, matchTeam, teamIndex, norm, keysFor, finderCode };
  if (typeof module !== "undefined") module.exports = api; else root.Bilyoner = api;
})(this);
