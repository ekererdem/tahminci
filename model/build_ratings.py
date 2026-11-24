"""Tahminci veri hazirlayici.
football-data.co.uk'tan son sezonlarin CSV'lerini indirir (ya da data/ klasorunu okur),
her lig icin takim guclerini hesaplar ve uygulamanin okudugu ratings.json'u yazar.

  python3 model/build_ratings.py --download  out/ratings.json   (GitHub Actions)
  python3 model/build_ratings.py --local data out/ratings.json  (yerel deneme, sadece Super Lig)
"""
import io, sys, json, glob, datetime as dt, urllib.request
import numpy as np, pandas as pd
from scipy.optimize import minimize
sys.path.insert(0, __file__.rsplit("/", 1)[0])
from dixon_coles import DixonColes

LEAGUES = {  # football-data.co.uk kodu: uygulamadaki adi
    "T1": "Türkiye Süper Lig", "E0": "İngiltere Premier Lig", "SP1": "İspanya La Liga",
    "I1": "İtalya Serie A", "D1": "Almanya Bundesliga", "F1": "Fransa Ligue 1",
    "E1": "İngiltere Championship", "E2": "İngiltere League One", "E3": "İngiltere League Two",
    "D2": "Almanya 2. Bundesliga", "I2": "İtalya Serie B", "SP2": "İspanya La Liga 2", "F2": "Fransa Ligue 2",
    "N1": "Hollanda Eredivisie", "B1": "Belçika Pro Lig", "P1": "Portekiz Liga", "G1": "Yunanistan Süper Lig",
    "SC0": "İskoçya Premiership",
}
HALF_LIFE, WINDOW = 365, 365 * 3

def season_codes(today, n=4):
    y = today.year if today.month >= 7 else today.year - 1
    return [f"{(y - k) % 100:02d}{(y - k + 1) % 100:02d}" for k in range(n)]

def read_csv(raw):
    d = pd.read_csv(io.BytesIO(raw) if isinstance(raw, bytes) else raw, encoding="latin1", on_bad_lines="skip")
    d = d.dropna(subset=["HomeTeam", "AwayTeam", "FTHG", "FTAG"])
    d["Date"] = pd.to_datetime(d["Date"], dayfirst=True, format="mixed")
    return d

def download(code, today):
    frames = []
    for s in season_codes(today):
        url = f"https://www.football-data.co.uk/mmz4281/{s}/{code}.csv"
        try:
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 tahminci"})
            raw = urllib.request.urlopen(req, timeout=60).read()
            frames.append(read_csv(raw)); print(f"  {code} {s}: {len(frames[-1])} mac")
        except Exception as e:
            print(f"  {code} {s}: yok ({e})")
    return pd.concat(frames) if frames else None

def fit_poisson(d, hcol, acol, ridge=1.0):
    """log(mu) = c + ev*h + hucum[takim] + savunma[rakip]; zaman agirlikli, hafif ridge cezali."""
    d = d.dropna(subset=[hcol, acol])
    teams = sorted(set(d.HomeTeam) | set(d.AwayTeam)); idx = {t: i for i, t in enumerate(teams)}; n = len(teams)
    hi = d.HomeTeam.map(idx).values; ai = d.AwayTeam.map(idx).values
    y = np.concatenate([d[hcol].values, d[acol].values]).astype(float)
    att = np.concatenate([hi, ai]); de = np.concatenate([ai, hi])
    home = np.concatenate([np.ones(len(d)), np.zeros(len(d))]); w = np.concatenate([d.w.values, d.w.values])
    def f(p):
        c, h, A, D = p[0], p[1], p[2:2 + n], p[2 + n:]
        eta = c + h * home + A[att] + D[de]; mu = np.exp(eta)
        nll = (w * (mu - y * eta)).sum() + ridge * ((A ** 2).sum() + (D ** 2).sum())
        r = w * (mu - y)
        g = np.zeros_like(p); g[0] = r.sum(); g[1] = (r * home).sum()
        g[2:2 + n] = np.bincount(att, r, n) + 2 * ridge * A; g[2 + n:] = np.bincount(de, r, n) + 2 * ridge * D
        return nll, g
    p0 = np.zeros(2 + 2 * n); p0[0] = np.log(max(y.mean(), 0.05))
    p = minimize(f, p0, jac=True, method="L-BFGS-B").x
    return {"c": round(p[0], 4), "h": round(p[1], 4),
            "att": {t: round(p[2 + i], 4) for t, i in idx.items()}, "def": {t: round(p[2 + n + i], 4) for t, i in idx.items()}}

def league_model(d, today):
    d = d.sort_values("Date")
    d = d[d.Date >= d.Date.max() - pd.Timedelta(days=WINDOW)].copy()
    d["w"] = 0.5 ** ((d.Date.max() - d.Date).dt.days / HALF_LIFE)
    d["H2G"] = d.FTHG - d.HTHG; d["A2G"] = d.FTAG - d.HTAG
    dc = DixonColes().fit(d.HomeTeam, d.AwayTeam, d.FTHG, d.FTAG, d.w)
    last = d[d.Date >= d.Date.max() - pd.Timedelta(days=60)]
    cur = sorted(set(last.HomeTeam) | set(last.AwayTeam))
    out = {
        "teams": cur, "matches": int(len(d)), "last_match": d.Date.max().strftime("%Y-%m-%d"),
        "dc": {"home": round(dc.home_adv, 4), "rho": round(dc.rho, 4),
               "att": {t: round(v, 4) for t, v in dc.att.items()}, "def": {t: round(v, 4) for t, v in dc.de.items()}},
        "ht": fit_poisson(d, "HTHG", "HTAG"), "h2": fit_poisson(d, "H2G", "A2G"),
    }
    if d.HC.notna().sum() > 100: out["corner"] = fit_poisson(d, "HC", "AC", ridge=2.0)
    if d.HY.notna().sum() > 100: out["yellow"] = fit_poisson(d, "HY", "AY", ridge=2.0)
    # Son 6 mac formu (bilgi amacli)
    form = {}
    for t in cur:
        m = d[(d.HomeTeam == t) | (d.AwayTeam == t)].tail(6)
        form[t] = "".join("G" if (r.HomeTeam == t and r.FTR == "H") or (r.AwayTeam == t and r.FTR == "A")
                          else "B" if r.FTR == "D" else "M" for r in m.itertuples())
    out["form"] = form
    # Bu sezon (1 Temmuz'dan beri) maç, attığı gol, yediği gol: eksik oyuncunun takımdaki payını hesaplamak için
    ss = dt.date(d.Date.max().year if d.Date.max().month >= 7 else d.Date.max().year - 1, 7, 1)
    cs = d[d.Date >= pd.Timestamp(ss)]
    season = {}
    for t in cur:
        h_, a_ = cs[cs.HomeTeam == t], cs[cs.AwayTeam == t]
        season[t] = [int(len(h_) + len(a_)), int(h_.FTHG.sum() + a_.FTAG.sum()), int(h_.FTAG.sum() + a_.FTHG.sum())]
    out["season"] = season
    # Son 30 günün sonuçları: uygulamadaki "karne" önerilerin tutup tutmadığını buradan işaretler
    rec = d[d.Date >= d.Date.max() - pd.Timedelta(days=30)]
    iv = lambda v: None if pd.isna(v) else int(v)
    out["recent"] = [[r.Date.strftime("%Y-%m-%d"), r.HomeTeam, r.AwayTeam, iv(r.FTHG), iv(r.FTAG), iv(r.HTHG), iv(r.HTAG),
                      iv(getattr(r, "HC", None)), iv(getattr(r, "AC", None))] for r in rec.itertuples()]
    return out

def main():
    mode, outp = sys.argv[1], sys.argv[-1]
    today = dt.date.today()
    res = {"generated": dt.datetime.now(dt.timezone.utc).strftime("%Y-%m-%d %H:%M UTC"), "leagues": {}}
    for code, name in LEAGUES.items():
        if mode == "--download":
            d = download(code, today)
        else:
            files = glob.glob(f"{sys.argv[2]}/*{code}*.csv")
            d = pd.concat([read_csv(f) for f in files]) if files else None
        if d is None or len(d) < 200: continue
        m = league_model(d, today); m["name"] = name
        res["leagues"][code] = m
        print(f"{code}: {len(m['teams'])} takim, {m['matches']} mac, rho={m['dc']['rho']}")
    with open(outp, "w", encoding="utf-8") as f:
        json.dump(res, f, ensure_ascii=False, separators=(",", ":"))

if __name__ == "__main__":
    main()
