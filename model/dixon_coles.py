"""Dixon-Coles (1997) gol modeli: zaman agirlikli maksimum olabilirlik + dusuk skor duzeltmesi (rho)."""
import numpy as np
from scipy.optimize import minimize
from scipy.stats import poisson

def tau(x, y, lh, la, rho):
    t = np.ones_like(lh)
    t = np.where((x == 0) & (y == 0), 1 - lh * la * rho, t)
    t = np.where((x == 0) & (y == 1), 1 + lh * rho, t)
    t = np.where((x == 1) & (y == 0), 1 + la * rho, t)
    t = np.where((x == 1) & (y == 1), 1 - rho, t)
    return t

class DixonColes:
    def fit(self, home, away, hg, ag, w):
        self.teams = sorted(set(home) | set(away))
        idx = {t: i for i, t in enumerate(self.teams)}
        hi = np.array([idx[t] for t in home]); ai = np.array([idx[t] for t in away])
        hg = np.asarray(hg, int); ag = np.asarray(ag, int); w = np.asarray(w, float)
        n = len(self.teams)
        lfh = np.array([np.log(np.arange(1, k + 1)).sum() for k in hg])
        lfa = np.array([np.log(np.arange(1, k + 1)).sum() for k in ag])

        def nll(p):
            att, de, home_adv, rho = p[:n], p[n:2 * n], p[2 * n], p[2 * n + 1]
            lh = np.exp(home_adv + att[hi] + de[ai]); la = np.exp(att[ai] + de[hi])
            t = tau(hg, ag, lh, la, rho)
            ll = (hg * np.log(lh) - lh - lfh) + (ag * np.log(la) - la - lfa) + np.log(np.clip(t, 1e-10, None))
            # hafif ceza: att toplami 0 (tanimlanabilirlik) + az veriye sahip takimlari ortalamaya cek
            return -(w * ll).sum() + 100 * att.sum() ** 2 + 0.5 * (att ** 2).sum() + 0.5 * (de ** 2).sum()

        p0 = np.concatenate([np.zeros(2 * n), [0.25, -0.05]])
        bounds = [(None, None)] * (2 * n) + [(None, None), (-0.3, 0.3)]
        r = minimize(nll, p0, method="L-BFGS-B", bounds=bounds)
        self.att, self.de = dict(zip(self.teams, r.x[:n])), dict(zip(self.teams, r.x[n:2 * n]))
        self.home_adv, self.rho = r.x[2 * n], r.x[2 * n + 1]
        return self

    def rates(self, h, a):
        return (np.exp(self.home_adv + self.att[h] + self.de[a]), np.exp(self.att[a] + self.de[h]))

    def score_matrix(self, h, a, max_goals=10):
        lh, la = self.rates(h, a)
        g = np.arange(max_goals + 1)
        m = np.outer(poisson.pmf(g, lh), poisson.pmf(g, la))
        X, Y = np.meshgrid(g, g, indexing="ij")
        m *= tau(X, Y, np.full_like(m, lh), np.full_like(m, la), self.rho)
        return m / m.sum()
