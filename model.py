"""Core model: feasibility check -> LP allocation -> cost/emission ledgers -> integrity checks.

Everything the dashboard shows is computed here, so the numbers can be audited
without reading any Streamlit code.
"""
from __future__ import annotations

import numpy as np
import pandas as pd
from scipy.optimize import linprog

PROPS = ["sio2", "al2o3", "fe2o3", "cao", "mgo", "so3", "loi",
         "moisture", "retained_45um", "sulphide_s", "glass_pct"]

PROP_LABEL = {
    "sum_oxides": "SiO2+Al2O3+Fe2O3 (%)",
    "basicity": "Basicity (CaO+MgO)/SiO2",
    "sio2": "SiO2 (%)", "al2o3": "Al2O3 (%)", "fe2o3": "Fe2O3 (%)",
    "cao": "CaO (%)", "mgo": "MgO (%)", "so3": "SO3 (%)",
    "loi": "Loss on ignition (%)", "moisture": "Moisture (%)",
    "retained_45um": "Retained on 45um (%)",
    "sulphide_s": "Sulphide sulphur (%)", "glass_pct": "Glass content (%)",
}

CAT_CREDIT = "Avoided virgin product"
EPS = 1e-6


# ----------------------------------------------------------------------------
# Helpers
# ----------------------------------------------------------------------------
def haversine_km(lat1, lon1, lat2, lon2):
    r = 6371.0088
    p1, p2 = np.radians(lat1), np.radians(lat2)
    dphi = p2 - p1
    dl = np.radians(lon2) - np.radians(lon1)
    a = np.sin(dphi / 2) ** 2 + np.cos(p1) * np.cos(p2) * np.sin(dl / 2) ** 2
    return float(2 * r * np.arcsin(np.sqrt(a)))


def road_km(lat1, lon1, lat2, lon2, circuity):
    """Great-circle distance x circuity factor (road is longer than straight line)."""
    return haversine_km(lat1, lon1, lat2, lon2) * circuity


def _num(df, cols):
    for c in cols:
        if c not in df.columns:
            df[c] = np.nan
        df[c] = pd.to_numeric(df[c], errors="coerce")
    return df


def clean_streams(df):
    d = df.copy()
    d = _num(d, ["tonnes", "lat", "lon"] + PROPS)
    d = d.dropna(subset=["stream_id", "tonnes", "lat", "lon"])
    d = d[d["tonnes"] > 0].copy()
    d["stream_id"] = d["stream_id"].astype(str)
    d["material"] = d["material"].astype(str)
    if "name" not in d.columns:
        d["name"] = d["stream_id"]
    return d.reset_index(drop=True)


def clean_buyers(df):
    d = _num(df.copy(), ["lat", "lon", "demand_cap_t", "price_inr_t"])
    d = d.dropna(subset=["buyer_id", "pathway_id", "lat", "lon", "demand_cap_t"])
    d["price_inr_t"] = d["price_inr_t"].fillna(0.0)
    return d.reset_index(drop=True)


def clean_disposal(df):
    d = _num(df.copy(), ["lat", "lon", "gate_fee_inr_t", "handling_em_kg_t"])
    d = d.dropna(subset=["site_id", "lat", "lon"])
    d[["gate_fee_inr_t", "handling_em_kg_t"]] = d[["gate_fee_inr_t", "handling_em_kg_t"]].fillna(0.0)
    return d.reset_index(drop=True)


def clean_pathways(df):
    d = _num(df.copy(), ["process_cost_inr_t", "process_em_kg_t",
                         "substitution_ratio", "displaced_ef_kg_t"])
    d = d.dropna(subset=["pathway_id"])
    d[["process_cost_inr_t", "process_em_kg_t", "substitution_ratio", "displaced_ef_kg_t"]] = \
        d[["process_cost_inr_t", "process_em_kg_t", "substitution_ratio", "displaced_ef_kg_t"]].fillna(0.0)
    return d.reset_index(drop=True)


def clean_rules(df):
    d = _num(df.copy(), ["min_val", "max_val"])
    return d.dropna(subset=["pathway_id", "prop"]).reset_index(drop=True)


def add_derived(streams):
    s = streams.copy()
    s["sum_oxides"] = s["sio2"] + s["al2o3"] + s["fe2o3"]
    s["basicity"] = (s["cao"] + s["mgo"]) / s["sio2"].replace(0, np.nan)
    return s


# ----------------------------------------------------------------------------
# Step 1: feasibility (rule-based property check)
# ----------------------------------------------------------------------------
def check_feasibility(streams, pathways, rules):
    s = add_derived(streams)
    rows = []
    for _, st in s.iterrows():
        for _, pw in pathways.iterrows():
            applies = [m.strip().lower() for m in str(pw["applies_to"]).split(";")]
            base = dict(stream_id=st["stream_id"], pathway_id=pw["pathway_id"], pathway=pw["pathway"])
            if st["material"].strip().lower() not in applies:
                rows.append({**base, "property": "(material type)", "value": np.nan,
                             "min": np.nan, "max": np.nan, "applicable": False,
                             "passed": False, "reason": f"{st['material']} not accepted by this pathway"})
                continue
            prules = rules[rules["pathway_id"] == pw["pathway_id"]]
            if prules.empty:
                rows.append({**base, "property": "(no rules)", "value": np.nan, "min": np.nan,
                             "max": np.nan, "applicable": True, "passed": True, "reason": ""})
            for _, r in prules.iterrows():
                v = st.get(r["prop"], np.nan)
                ok, reason = True, ""
                label = PROP_LABEL.get(r["prop"], r["prop"])
                if pd.isna(v):
                    ok, reason = False, f"{label}: no data"
                else:
                    if pd.notna(r["min_val"]) and v < r["min_val"]:
                        ok, reason = False, f"{label} = {v:.2f} (need >= {r['min_val']:g})"
                    if pd.notna(r["max_val"]) and v > r["max_val"]:
                        ok, reason = False, f"{label} = {v:.2f} (need <= {r['max_val']:g})"
                rows.append({**base, "property": label, "value": v, "min": r["min_val"],
                             "max": r["max_val"], "applicable": True, "passed": ok,
                             "reason": reason})
    detail = pd.DataFrame(rows)
    summ = (detail.groupby(["stream_id", "pathway_id", "pathway"], sort=False)
            .agg(applicable=("applicable", "first"), feasible=("passed", "all"),
                 reason=("reason", lambda x: "; ".join([i for i in x if i])))
            .reset_index())
    summ["feasible"] = summ["feasible"] & summ["applicable"]
    return detail, summ


# ----------------------------------------------------------------------------
# Step 2: arcs (every possible stream -> destination move with unit cost/emissions)
# ----------------------------------------------------------------------------
def build_arcs(streams, buyers, disposal, pathways, feas, p):
    pw = pathways.set_index("pathway_id")
    rate, ef_t, circ = p["transport_cost"], p["transport_em"], p["circuity"]
    arcs = []
    for _, s in streams.iterrows():
        for _, b in buyers.iterrows():
            if not feas.get((s["stream_id"], b["pathway_id"]), False) or b["pathway_id"] not in pw.index:
                continue
            q = pw.loc[b["pathway_id"]]
            d = road_km(s["lat"], s["lon"], b["lat"], b["lon"], circ)
            arcs.append(dict(
                kind="reuse", stream_id=s["stream_id"], stream_name=s["name"],
                dest_id=b["buyer_id"], dest_name=b["name"], pathway_id=b["pathway_id"],
                pathway=q["pathway"], dist_km=d, price_inr_t=b["price_inr_t"],
                process_cost_inr_t=q["process_cost_inr_t"], gate_fee_inr_t=0.0,
                process_em_kg_t=q["process_em_kg_t"], handling_em_kg_t=0.0,
                substitution_ratio=q["substitution_ratio"],
                displaced_ef_kg_t=q["displaced_ef_kg_t"],
                cost_per_t=d * rate + q["process_cost_inr_t"] - b["price_inr_t"],
                em_per_t=d * ef_t + q["process_em_kg_t"] - q["substitution_ratio"] * q["displaced_ef_kg_t"],
            ))
        for _, x in disposal.iterrows():
            d = road_km(s["lat"], s["lon"], x["lat"], x["lon"], circ)
            arcs.append(dict(
                kind="disposal", stream_id=s["stream_id"], stream_name=s["name"],
                dest_id=x["site_id"], dest_name=x["name"], pathway_id="DISP",
                pathway="Disposal", dist_km=d, price_inr_t=0.0, process_cost_inr_t=0.0,
                gate_fee_inr_t=x["gate_fee_inr_t"], process_em_kg_t=0.0,
                handling_em_kg_t=x["handling_em_kg_t"], substitution_ratio=0.0,
                displaced_ef_kg_t=0.0,
                cost_per_t=d * rate + x["gate_fee_inr_t"],
                em_per_t=d * ef_t + x["handling_em_kg_t"],
            ))
    return pd.DataFrame(arcs)


# ----------------------------------------------------------------------------
# Step 3: linear program
# ----------------------------------------------------------------------------
def optimize(arcs, streams, buyers, carbon_price, min_div_frac):
    """min  sum (cost_per_t + lambda * em_per_t) * x
       s.t. each stream fully allocated, buyer demand caps, optional diversion floor."""
    n = len(arcs)
    lam = carbon_price / 1000.0  # ₹ per kgCO2e
    c = (arcs["cost_per_t"] + lam * arcs["em_per_t"]).to_numpy(float)

    sids = list(streams["stream_id"])
    a_eq = np.zeros((len(sids), n))
    s_idx = {s: i for i, s in enumerate(sids)}
    for j, sid in enumerate(arcs["stream_id"]):
        a_eq[s_idx[sid], j] = 1.0
    b_eq = streams["tonnes"].to_numpy(float)

    bids = list(buyers["buyer_id"])
    b_idx = {b: i for i, b in enumerate(bids)}
    a_ub = np.zeros((len(bids), n))
    for j, (kind, dest) in enumerate(zip(arcs["kind"], arcs["dest_id"])):
        if kind == "reuse":
            a_ub[b_idx[dest], j] = 1.0
    b_ub = buyers["demand_cap_t"].to_numpy(float)

    if min_div_frac > 0:
        row = -(arcs["kind"] == "reuse").to_numpy(float)
        a_ub = np.vstack([a_ub, row])
        b_ub = np.append(b_ub, -min_div_frac * b_eq.sum())

    res = linprog(c, A_ub=a_ub, b_ub=b_ub, A_eq=a_eq, b_eq=b_eq,
                  bounds=(0, None), method="highs")
    if res.status != 0:
        return None
    x = np.where(res.x < EPS, 0.0, res.x)
    return x, float(res.fun)


# ----------------------------------------------------------------------------
# Step 4: ledgers (one line per cost / emission item, with its basis)
# ----------------------------------------------------------------------------
def build_ledgers(alloc, baseline, p):
    cl, el = [], []
    for scen, df in (("Baseline: all to disposal", baseline), ("Optimized allocation", alloc)):
        for r in df.itertuples():
            t = r.tonnes
            base = dict(scenario=scen, stream_id=r.stream_id, destination=r.dest_name,
                        pathway_id=r.pathway_id, pathway=r.pathway, tonnes=t)
            tr_c = r.dist_km * p["transport_cost"]
            tr_e = r.dist_km * p["transport_em"]
            cl.append({**base, "category": "Transport", "unit": "₹/t", "unit_value": tr_c,
                       "value": t * tr_c,
                       "basis": f"{r.dist_km:.0f} km x {p['transport_cost']:g} ₹/t-km"})
            el.append({**base, "category": "Transport", "unit": "kgCO2e/t", "unit_value": tr_e,
                       "value": t * tr_e,
                       "basis": f"{r.dist_km:.0f} km x {p['transport_em']:g} kgCO2e/t-km"})
            if r.kind == "reuse":
                cl.append({**base, "category": "Processing", "unit": "₹/t",
                           "unit_value": r.process_cost_inr_t, "value": t * r.process_cost_inr_t,
                           "basis": "pathway processing cost"})
                cl.append({**base, "category": "Revenue", "unit": "₹/t",
                           "unit_value": -r.price_inr_t, "value": -t * r.price_inr_t,
                           "basis": "buyer price (credit)"})
                el.append({**base, "category": "Processing", "unit": "kgCO2e/t",
                           "unit_value": r.process_em_kg_t, "value": t * r.process_em_kg_t,
                           "basis": "pathway processing emission factor"})
                cu = -r.substitution_ratio * r.displaced_ef_kg_t
                el.append({**base, "category": CAT_CREDIT, "unit": "kgCO2e/t",
                           "unit_value": cu, "value": t * cu,
                           "basis": f"{r.substitution_ratio:g} t displaced product/t waste x "
                                    f"{r.displaced_ef_kg_t:g} kgCO2e/t"})
            else:
                cl.append({**base, "category": "Disposal gate fee", "unit": "₹/t",
                           "unit_value": r.gate_fee_inr_t, "value": t * r.gate_fee_inr_t,
                           "basis": "site gate fee"})
                el.append({**base, "category": "Disposal handling", "unit": "kgCO2e/t",
                           "unit_value": r.handling_em_kg_t, "value": t * r.handling_em_kg_t,
                           "basis": "site handling emission factor"})
    return pd.DataFrame(cl), pd.DataFrame(el)


# ----------------------------------------------------------------------------
# Step 5: integrity checks (the "no double counting" proof)
# ----------------------------------------------------------------------------
def run_checks(alloc, baseline, streams, buyers, feas, cost_l, em_l, pathways, summary, objective, lam):
    out = []

    def add(name, ok, detail):
        out.append(dict(check=name, passed=bool(ok), detail=detail))

    # 1 mass balance
    got = alloc.groupby("stream_id")["tonnes"].sum().reindex(streams["stream_id"]).fillna(0)
    add("Mass balance: every tonne of every stream is allocated exactly once",
        np.allclose(got.to_numpy(), streams["tonnes"].to_numpy(), atol=1e-3),
        f"allocated {got.sum():,.0f} t of {streams['tonnes'].sum():,.0f} t")

    # 2 buyer capacity
    used = alloc[alloc["kind"] == "reuse"].groupby("dest_id")["tonnes"].sum()
    caps = buyers.set_index("buyer_id")["demand_cap_t"].reindex(used.index)
    add("Buyer demand caps respected", bool((used <= caps + 1e-3).all()),
        "max utilisation " + (f"{(used / caps).max():.0%}" if len(used) else "n/a"))

    # 3 feasibility
    reuse = alloc[alloc["kind"] == "reuse"]
    bad = [(r.stream_id, r.pathway_id) for r in reuse.itertuples()
           if not feas.get((r.stream_id, r.pathway_id), False)]
    add("Only property-feasible stream-pathway pairs receive material", not bad,
        "no infeasible pairs used" if not bad else f"violations: {bad}")

    # 4 one credit per diverted tonne
    cred = em_l[(em_l["scenario"] == "Optimized allocation") & (em_l["category"] == CAT_CREDIT)]
    cred_by_stream = cred.groupby("stream_id")["tonnes"].sum()
    div_by_stream = reuse.groupby("stream_id")["tonnes"].sum()
    one_each = (cred.groupby(["stream_id", "destination"]).size() == 1).all() if len(cred) else True
    same = np.allclose(cred_by_stream.reindex(div_by_stream.index).fillna(0).to_numpy(),
                       div_by_stream.to_numpy(), atol=1e-3)
    add("One avoided-product credit per diverted tonne (credited t = diverted t, one line per route)",
        bool(one_each and same),
        f"credited {cred['tonnes'].sum():,.0f} t vs diverted {reuse['tonnes'].sum():,.0f} t")

    # 5 credit formula recomputed from the pathway table
    pw = pathways.set_index("pathway_id")
    recomputed = -(cred["tonnes"] * cred["pathway_id"].map(pw["substitution_ratio"])
                   * cred["pathway_id"].map(pw["displaced_ef_kg_t"]))
    add("Credit = tonnes x substitution ratio x displaced-product factor (recomputed independently)",
        np.allclose(recomputed.to_numpy(), cred["value"].to_numpy(), atol=1e-3),
        f"{len(cred)} credit lines re-derived")

    # 6 no avoided-disposal credit line exists
    cats = set(em_l["category"])
    add("Avoided disposal is NOT a separate credit (it appears once, via the baseline)",
        not any("avoid" in c.lower() and "disposal" in c.lower() for c in cats)
        and set(em_l[em_l["scenario"].str.startswith("Baseline")]["category"]) <= {"Transport", "Disposal handling"},
        "baseline holds only transport + disposal handling; scenario holds no disposal credit")

    # 7 reconciliation
    e_base = em_l[em_l["scenario"].str.startswith("Baseline")]["value"].sum() / 1000
    e_opt = em_l[em_l["scenario"] == "Optimized allocation"]["value"].sum() / 1000
    arc_e = (alloc["tonnes"] * alloc["em_per_t"]).sum() / 1000
    add("Ledger total reconciles with the optimizer's per-tonne coefficients",
        np.isclose(e_opt, arc_e, atol=1e-3) and np.isclose(e_opt - e_base, summary["em_delta_t"], atol=1e-3),
        f"optimized {e_opt:,.1f} t, baseline {e_base:,.1f} t, change {e_opt - e_base:,.1f} tCO2e")

    # 8 objective reproduces
    obj = float(((alloc["cost_per_t"] + lam * alloc["em_per_t"]) * alloc["tonnes"]).sum())
    add("LP objective value reproduces from the allocation", np.isclose(obj, objective, rtol=1e-6, atol=1e-3),
        f"objective = ₹{obj:,.0f} (cost + carbon price x emissions)")
    return pd.DataFrame(out)


# ----------------------------------------------------------------------------
# Orchestrator
# ----------------------------------------------------------------------------
def run_scenario(streams, pathways, rules, buyers, disposal, p):
    streams = clean_streams(streams)
    pathways = clean_pathways(pathways)
    rules = clean_rules(rules)
    buyers = clean_buyers(buyers)
    disposal = clean_disposal(disposal)

    if streams.empty:
        return dict(status="error", message="No valid waste streams (need stream_id, tonnes > 0, lat, lon).")
    if disposal.empty:
        return dict(status="error", message="Add at least one disposal site (the baseline needs it).")

    detail, fsum = check_feasibility(streams, pathways, rules)
    feas = {(r.stream_id, r.pathway_id): bool(r.feasible) for r in fsum.itertuples()}
    arcs = build_arcs(streams, buyers, disposal, pathways, feas, p)

    sol = optimize(arcs, streams, buyers, p["carbon_price"], p["min_div_pct"] / 100.0)
    if sol is None:
        return dict(status="error",
                    message="No feasible plan: the minimum-diversion target is higher than what the "
                            "feasible pathways and buyer demand caps allow. Lower the target.")
    x, objective = sol
    arcs = arcs.assign(tonnes=x)
    alloc = arcs[arcs["tonnes"] > EPS].copy().reset_index(drop=True)

    # Baseline: each stream goes entirely to its cheapest disposal site (cost incl. transport)
    disp = arcs[arcs["kind"] == "disposal"]
    idx = disp.groupby("stream_id")["cost_per_t"].idxmin()
    baseline = disp.loc[idx].copy()
    baseline["tonnes"] = baseline["stream_id"].map(streams.set_index("stream_id")["tonnes"])
    baseline = baseline.reset_index(drop=True)

    cost_l, em_l = build_ledgers(alloc, baseline, p)

    tot = float(streams["tonnes"].sum())
    div = float(alloc.loc[alloc["kind"] == "reuse", "tonnes"].sum())
    is_b = lambda df: df["scenario"].str.startswith("Baseline")
    summary = dict(
        total_t=tot, diverted_t=div, diverted_pct=100 * div / tot, disposed_t=tot - div,
        cost_base=float(cost_l[is_b(cost_l)]["value"].sum()),
        cost_opt=float(cost_l[~is_b(cost_l)]["value"].sum()),
        em_base_t=float(em_l[is_b(em_l)]["value"].sum() / 1000),
        em_opt_t=float(em_l[~is_b(em_l)]["value"].sum() / 1000),
    )
    summary["cost_delta"] = summary["cost_opt"] - summary["cost_base"]
    summary["em_delta_t"] = summary["em_opt_t"] - summary["em_base_t"]

    checks = run_checks(alloc, baseline, streams, buyers, feas, cost_l, em_l, pathways,
                        summary, objective, p["carbon_price"] / 1000.0)

    # Per-stream and per-pathway roll-ups
    def roll(df, key, col):
        return df.groupby(key)["value"].sum().rename(col)

    ol = cost_l[~is_b(cost_l)]; ob = cost_l[is_b(cost_l)]
    oe = em_l[~is_b(em_l)]; be = em_l[is_b(em_l)]
    by_stream = streams[["stream_id", "name", "material", "tonnes"]].set_index("stream_id")
    by_stream["diverted_t"] = alloc[alloc["kind"] == "reuse"].groupby("stream_id")["tonnes"].sum()
    by_stream["diverted_t"] = by_stream["diverted_t"].fillna(0.0)
    by_stream["diverted_pct"] = 100 * by_stream["diverted_t"] / by_stream["tonnes"]
    by_stream["net_cost_opt_inr"] = roll(ol, "stream_id", "x")
    by_stream["net_cost_base_inr"] = roll(ob, "stream_id", "x")
    by_stream["em_opt_t"] = roll(oe, "stream_id", "x") / 1000
    by_stream["em_base_t"] = roll(be, "stream_id", "x") / 1000
    by_stream["em_change_t"] = by_stream["em_opt_t"] - by_stream["em_base_t"]
    by_stream = by_stream.reset_index()

    by_path = (alloc.groupby("pathway")["tonnes"].sum().rename("tonnes").reset_index()
               .sort_values("tonnes", ascending=False))

    return dict(status="ok", streams=streams, buyers=buyers, disposal=disposal, pathways=pathways,
                rules=rules, feas_detail=detail, feas_summary=fsum, arcs=arcs, alloc=alloc,
                baseline=baseline, cost_ledger=cost_l, em_ledger=em_l, summary=summary,
                checks=checks, by_stream=by_stream, by_path=by_path, objective=objective)
