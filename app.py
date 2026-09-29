"""Waste-to-Value Optimizer: ENR-04 prototype (Streamlit UI). Logic lives in model.py."""
import html
import re
from pathlib import Path

import numpy as np
import pandas as pd
import plotly.express as px
import plotly.graph_objects as go
import streamlit as st

import model as M

st.set_page_config(page_title="Waste-to-Value Optimizer", page_icon="♻️", layout="wide")
DATA = Path(__file__).parent / "data"


@st.cache_data
def load(name: str) -> pd.DataFrame:
    return pd.read_csv(DATA / f"{name}.csv")


# ---------------------------------------------------------------- formatting
def ind(n):
    """Indian digit grouping: 1234567 -> 12,34,567."""
    n = int(round(n)); s = str(abs(n))
    if len(s) > 3:
        s = re.sub(r"(\d)(?=(\d\d)+$)", r"\1,", s[:-3]) + "," + s[-3:]
    return ("-" if n < 0 else "") + s


def rupees(n):
    a, sg = abs(n), "-" if n < 0 else ""
    if a >= 1e7:
        return f"{sg}₹{a / 1e7:,.2f} crore"
    if a >= 1e5:
        return f"{sg}₹{a / 1e5:,.2f} lakh"
    return f"{sg}₹{ind(a)}"


def tonnes(n):
    return f"{ind(n)} t"


st.markdown("""<style>
[data-testid="stAppDeployButton"]{display:none}
.stApp{background-image:radial-gradient(900px 420px at 92% -8%,rgba(145,172,103,.22),transparent 60%),radial-gradient(800px 380px at -6% 38%,rgba(110,53,17,.10),transparent 60%);background-attachment:fixed}
.block-container{padding-top:2.2rem;max-width:1200px}
.block-container h1{background:linear-gradient(90deg,#597928,#7FA03D);-webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;font-weight:800}
.block-container h3{border-left:6px solid #597928;padding-left:.7rem;margin-top:.8rem}
.hero{position:relative;overflow:hidden;background:linear-gradient(120deg,#6E3511 0%,#597928 100%);color:#fff;padding:1.7rem 2rem;border-radius:20px;margin:.8rem 0 1.2rem;border:2px solid rgba(255,255,255,.30);box-shadow:0 10px 30px rgba(110,53,17,.30)}
.hero:after{content:"";position:absolute;right:-60px;top:-80px;width:260px;height:260px;border-radius:50%;background:rgba(255,255,255,.10)}
.hero .t{font-size:1.65rem;font-weight:800;line-height:1.35;position:relative}
.hero .s{opacity:.93;font-size:1rem;margin-top:.4rem;position:relative}
.kpi{background:rgba(145,172,103,.11);border:2px solid rgba(89,121,40,0.70);border-radius:18px;padding:1.05rem 1.2rem;height:100%;box-shadow:0 4px 14px rgba(0,0,0,.10)}
.kpi.alt{background:rgba(110,53,17,.10);border-color:rgba(110,53,17,.55)}
.kpi .l{font-size:.74rem;text-transform:uppercase;letter-spacing:.06em;opacity:.72;font-weight:600}
.kpi .v{font-size:1.75rem;font-weight:800;line-height:1.25}
.kpi .s{font-size:.85rem;opacity:.75}
.card{display:grid;grid-template-columns:minmax(200px,1fr) 2.2fr;gap:1rem;background:rgba(145,172,103,.08);border:2px solid rgba(89,121,40,0.65);border-radius:16px;padding:1rem 1.2rem;margin:.6rem 0;box-shadow:0 3px 10px rgba(0,0,0,.08)}
.card .n{font-weight:800;font-size:1.02rem}.card .m{opacity:.75;font-size:.88rem}
.card .msg{margin-top:.35rem}.card .cap{opacity:.7;font-size:.82rem;margin-top:.25rem}
@media(max-width:800px){.card{grid-template-columns:1fr}}
.chip{display:inline-block;padding:.15rem .65rem;border-radius:999px;font-size:.78rem;margin:.12rem .25rem .12rem 0}
.ok{background:#E6EFD3;color:#3B5219;border:1px solid #91AC67}.no{background:#F8DDCF;color:#7A2E12;border:1px solid #D9A38A}
[data-testid="stExpander"] details{border:2px solid rgba(89,121,40,0.65)!important;border-radius:14px!important}
[data-testid="stPlotlyChart"]{border:2px solid rgba(89,121,40,0.55);border-radius:14px;padding:.35rem;background:rgba(145,172,103,.05)}
[data-testid="stDataFrame"]{border:2px solid rgba(89,121,40,0.55);border-radius:12px;overflow:hidden}
.stButton button{border:2px solid rgba(89,121,40,0.80)!important;border-radius:12px!important;font-weight:600}
.stButton button:hover{background:rgba(145,172,103,.20)!important}
</style>""", unsafe_allow_html=True)


def kpi(col, label, value, sub="", cls=""):
    col.markdown(f'<div class="kpi {cls}"><div class="l">{label}</div><div class="v">{value}</div>'
                 f'<div class="s">{sub}</div></div>', unsafe_allow_html=True)


# ---------------------------------------------------------------- scenario controls
PRESETS = {"💰 Lowest cost": (0, 0), "⚖️ Balanced": (5000, 60), "🌍 Climate-first": (20000, 80)}
st.session_state.setdefault("carbon_price", 0)
st.session_state.setdefault("min_div", 0)


def set_preset(cp, md):
    st.session_state.carbon_price, st.session_state.min_div = cp, md


st.sidebar.markdown("### ♻️ Scenario")
st.sidebar.slider("Carbon price (₹ per tCO₂e)", 0, 20000, step=500, key="carbon_price",
                  help="0 = minimise cost only. Higher values make the optimizer trade cost for lower emissions.")
st.sidebar.slider("Minimum diversion target (%)", 0, 100, step=5, key="min_div",
                  help="Force at least this share of waste into reuse.")
with st.sidebar.expander("Advanced assumptions"):
    t_cost = st.number_input("Transport cost (₹ per tonne-km)", 0.0, 50.0, 3.0, 0.5)
    t_em = st.number_input("Transport emissions (kgCO₂e per tonne-km)", 0.0, 1.0, 0.09, 0.01)
    circ = st.slider("Road distance factor (× straight line)", 1.0, 1.6, 1.3, 0.05)
    density = st.number_input("Waste bulk density (t/m³)", 0.5, 3.0, 1.2, 0.1)
st.sidebar.caption("All costs, prices and factors are sample assumptions. Edit them under "
                   "'Advanced: data' at the bottom of the page.")
params = dict(transport_cost=t_cost, transport_em=t_em, circuity=circ,
              carbon_price=st.session_state.carbon_price, min_div_pct=st.session_state.min_div)

# ---------------------------------------------------------------- page skeleton (display order)
st.title("Waste-to-Value Optimizer")
st.caption("Turn fly ash, slag and mine waste into revenue, and see exactly what it does to cost and "
           "carbon compared with simple disposal.")
st.markdown("**Quick scenarios**")
pc = st.columns([1, 1, 1, 2])
for col, (name, (cp, md)) in zip(pc, PRESETS.items()):
    col.button(name, on_click=set_preset, args=(cp, md), width="stretch")
hero, kpis, flow, why, impact, charts, explore, advanced = (st.container() for _ in range(8))

# ---------------------------------------------------------------- inputs (rendered last, computed first)
with advanced:
    with st.expander("⚙️ Advanced: data, rules and buyers (fully editable)"):
        st.markdown("**Waste streams** (quantity, composition, location)")
        template = load("streams")
        c1, c2 = st.columns([3, 1])
        up = c1.file_uploader("Upload your own streams CSV (same columns as the template)", type="csv")
        c2.download_button("Download template", template.to_csv(index=False).encode("utf-8-sig"),
                           "streams_template.csv", "text/csv", width="stretch")
        base_streams, tag = template, "default"
        if up is not None:
            try:
                u = pd.read_csv(up)
                miss = {"stream_id", "material", "tonnes", "lat", "lon"} - set(u.columns)
                if miss:
                    st.error(f"Missing columns: {sorted(miss)}. Using sample data instead.")
                else:
                    base_streams, tag = u, up.name
            except Exception as e:  # noqa: BLE001
                st.error(f"Could not read the file ({e}). Using sample data instead.")
        streams_in = st.data_editor(base_streams, num_rows="dynamic", width="stretch", key=f"streams_{tag}")
        st.caption("Oxides, LOI, moisture, sulphide sulphur and glass content are in %. A blank cell means "
                   "'not measured', so any rule that needs it fails.")
        st.markdown("**Reuse pathways** (processing cost ₹/t, emissions, substitution ratio)")
        pathways_in = st.data_editor(load("pathways"), num_rows="dynamic", width="stretch", key="pathways")
        st.markdown("**Property requirements** (min / max per pathway)")
        rules_in = st.data_editor(load("rules"), num_rows="dynamic", width="stretch", key="rules")
        st.caption("`prop` can be any stream column plus `sum_oxides` and `basicity` (derived).")
        st.markdown("**Buyers** (demand cap in tonnes, price ₹/t)")
        buyers_in = st.data_editor(load("buyers"), num_rows="dynamic", width="stretch", key="buyers")
        st.markdown("**Disposal sites** (gate fee ₹/t, handling emissions): the baseline")
        disposal_in = st.data_editor(load("disposal"), num_rows="dynamic", width="stretch", key="disposal")

res = M.run_scenario(streams_in, pathways_in, rules_in, buyers_in, disposal_in, params)
if res["status"] != "ok":
    hero.error(res["message"])
    st.stop()

s, al = res["summary"], res["alloc"]
saving, co2_cut = s["cost_base"] - s["cost_opt"], -s["em_delta_t"]

# ---------------------------------------------------------------- hero + KPIs
hero.markdown(
    f'<div class="hero"><div class="t">{s["diverted_pct"]:.0f}% of waste diverted · '
    f'{rupees(abs(saving))} {"better" if saving >= 0 else "costlier"} than disposal · '
    f'{ind(abs(co2_cut))} tCO₂e {"avoided" if co2_cut >= 0 else "added"}</div>'
    f'<div class="s">Optimized plan for {tonnes(s["total_t"])} of waste across {len(res["streams"])} streams, '
    f'matched to {al[al.kind == "reuse"].pathway_id.nunique()} reuse pathways. '
    f'Scenario: carbon price ₹{ind(params["carbon_price"])}/tCO₂e · minimum diversion {params["min_div_pct"]}%.</div></div>',
    unsafe_allow_html=True)
with kpis:
    k = st.columns(4)
    kpi(k[0], "Waste diverted", f"{tonnes(s['diverted_t'])}", f"{s['diverted_pct']:.1f}% of {tonnes(s['total_t'])}")
    kpi(k[1], "Saved vs simple disposal", rupees(saving), f"disposal would cost {rupees(s['cost_base'])}")
    kpi(k[2], "Net emissions change", f"{ind(s['em_delta_t'])} tCO₂e",
        f"baseline {ind(s['em_base_t'])} → optimized {ind(s['em_opt_t'])}")
    kpi(k[3], "Net result of the plan", rupees(abs(s["cost_opt"])),
        "net income" if s["cost_opt"] < 0 else "net cost")


# ---------------------------------------------------------------- flow: sankey, map, table
def sankey(a):
    labels, idx = [], {}

    def node(n):
        if n not in idx:
            idx[n] = len(labels); labels.append(n)
        return idx[n]

    src, tgt, val, col = [], [], [], []
    for r in a.itertuples():
        x, y, z = node(r.stream_id), node(r.pathway), node(r.dest_name)
        src += [x, y]; tgt += [y, z]; val += [r.tonnes, r.tonnes]
        c = "rgba(220,80,80,0.35)" if r.kind == "disposal" else "rgba(89,121,40,0.40)"
        col += [c, c]
    ncol = ["#B23A1E" if lb == "Disposal" else "#597928" for lb in labels]
    f = go.Figure(go.Sankey(node=dict(label=labels, pad=14, thickness=16, color=ncol),
                            link=dict(source=src, target=tgt, value=val, color=col)))
    f.update_layout(height=500, margin=dict(l=0, r=0, t=10, b=10))
    return f


def make_map(r):
    loc = {}
    for df, idc in ((r["streams"], "stream_id"), (r["buyers"], "buyer_id"), (r["disposal"], "site_id")):
        for row in df.itertuples():
            loc[getattr(row, idc)] = (row.lat, row.lon)
    f = go.Figure()
    for a in r["alloc"].itertuples():
        (la, lo), (lb, lb2) = loc[a.stream_id], loc[a.dest_id]
        f.add_trace(go.Scattermap(
            lat=[la, lb], lon=[lo, lb2], mode="lines", showlegend=False, hoverinfo="text",
            text=f"{a.stream_id} → {a.dest_name}: {tonnes(a.tonnes)}",
            line=dict(width=float(max(2.0, min(14.0, a.tonnes / 3500))),
                      color="#B23A1E" if a.kind == "disposal" else "#597928")))
    for df, label, color in ((r["streams"], "Waste source", "#D98324"), (r["buyers"], "Buyer", "#597928"),
                             (r["disposal"], "Disposal site", "#B23A1E")):
        f.add_trace(go.Scattermap(lat=df["lat"], lon=df["lon"], mode="markers", name=label, text=df["name"],
                                  marker=dict(size=13, color=color), hoverinfo="text"))
    lats = pd.concat([r["streams"]["lat"], r["buyers"]["lat"], r["disposal"]["lat"]])
    lons = pd.concat([r["streams"]["lon"], r["buyers"]["lon"], r["disposal"]["lon"]])
    span = max(lons.max() - lons.min(), 1.6 * (lats.max() - lats.min()), 0.5)
    f.update_layout(map=dict(style="open-street-map", zoom=float(np.clip(np.log2(700 / (1.3 * span)), 1, 12)),
                             center=dict(lat=float((lats.max() + lats.min()) / 2),
                                         lon=float((lons.max() + lons.min()) / 2))),
                    height=540, margin=dict(l=0, r=0, t=0, b=0), legend=dict(orientation="h", y=1.02, bgcolor="rgba(255,255,255,.88)", font=dict(color="#6E3511")))
    return f


with flow:
    st.subheader("Where does the waste go?")
    t1, t2, t3 = st.tabs(["Flow diagram", "Map", "Full allocation table"])
    t1.plotly_chart(sankey(al), width="stretch")
    t1.caption("Red flows go to disposal; teal flows go to reuse.")
    t2.plotly_chart(make_map(res), width="stretch")
    t2.caption("Orange = waste source · green = buyer · dark red = disposal · line width ∝ tonnes.")
    tbl = al[["stream_id", "stream_name", "pathway", "dest_name", "tonnes", "dist_km", "cost_per_t", "em_per_t"]]
    t3.dataframe(tbl.rename(columns={
        "stream_id": "Stream", "stream_name": "Stream name", "pathway": "Pathway", "dest_name": "Destination",
        "tonnes": "Tonnes", "dist_km": "Road km", "cost_per_t": "Net cost (₹/t)",
        "em_per_t": "Net emissions (kgCO₂e/t)"}).round(1), width="stretch", hide_index=True)
    t3.caption("Negative net cost = buyer payment exceeds transport + processing. "
               "Negative emissions = avoided-product credit exceeds transport + processing.")

# ---------------------------------------------------------------- why cards
with why:
    st.subheader("Why each stream goes where it does")
    fs, bs = res["feas_summary"], res["by_stream"].set_index("stream_id")
    cards = []
    for r in res["streams"].itertuples():
        f = fs[(fs.stream_id == r.stream_id) & fs.applicable]
        ok, bad = f[f.feasible], f[~f.feasible]
        reuse = al[(al.stream_id == r.stream_id) & (al.kind == "reuse")]
        div = float(bs.loc[r.stream_id, "diverted_t"])
        chips = "".join(f'<span class="chip ok">✅ {html.escape(p)}</span>' for p in ok.pathway)
        chips += "".join(f'<span class="chip no">❌ {html.escape(p)}: {html.escape(rs.split("; ")[0])}</span>'
                         for p, rs in zip(bad.pathway, bad.reason))
        detail = html.escape("; ".join(f"{tonnes(x.tonnes)} → {x.dest_name}" for x in reuse.itertuples()))
        if ok.empty:
            msg = f"🚫 No reuse pathway accepts this stream, so all {tonnes(r.tonnes)} go to disposal."
        elif div >= r.tonnes - 1:
            msg = f"✅ All {tonnes(r.tonnes)} reused: {detail}."
        else:
            msg = (f"⚠️ {tonnes(div)} reused ({detail}); {tonnes(r.tonnes - div)} go to disposal because buyer "
                   "demand is full or reuse would cost more than disposal.")
        gain = bs.loc[r.stream_id, "net_cost_base_inr"] - bs.loc[r.stream_id, "net_cost_opt_inr"]
        cards.append(
            f'<div class="card"><div><div class="n">{html.escape(str(r.name))}</div>'
            f'<div class="m">{tonnes(r.tonnes)} · {html.escape(r.material)} · {html.escape(str(r.location))}</div></div>'
            f'<div><div>{chips or "<span class=chip>No accepted pathway for this material</span>"}</div>'
            f'<div class="msg">{msg}</div>'
            f'<div class="cap">Emissions change {ind(bs.loc[r.stream_id, "em_change_t"])} tCO₂e · '
            f'{rupees(gain)} saved vs disposal</div></div></div>')
    st.markdown("".join(cards), unsafe_allow_html=True)

# ---------------------------------------------------------------- impact
with impact:
    st.subheader("Impact")
    pw = res["pathways"].set_index("pathway_id")
    ru = al[al.kind == "reuse"].copy()
    ru["prod"] = ru["pathway_id"].map(pw["displaced_product"]).fillna("")
    cement_t = float((ru["tonnes"] * ru["substitution_ratio"])[ru["prod"].str.contains("cement", case=False)].sum())
    space_m3 = s["diverted_t"] / density
    revenue = -float(res["cost_ledger"].query("scenario == 'Optimized allocation' and category == 'Revenue'")["value"].sum())
    i = st.columns(4)
    kpi(i[0], "Waste kept out of disposal", tonnes(s["diverted_t"]), f"{s['diverted_pct']:.0f}% of all streams", cls="alt")
    kpi(i[1], "CO₂e avoided" if co2_cut >= 0 else "CO₂e added", f"{ind(abs(co2_cut))} t", "net, vs simple disposal", cls="alt")
    kpi(i[2], "Virgin cement displaced", tonnes(cement_t), "via substitution ratio, no double count", cls="alt")
    kpi(i[3], "Disposal space saved", f"{ind(space_m3)} m³", f"≈ {space_m3 / 2500:,.1f} Olympic pools", cls="alt")
    st.caption(f"Buyers pay {rupees(revenue)} for these materials. Space uses the bulk density in the sidebar "
               "(assumption); an Olympic pool is taken as 2,500 m³.")

# ---------------------------------------------------------------- charts
COLORS = {"Transport": "#D98324", "Processing": "#6E3511", "Revenue": "#91AC67",
          "Disposal gate fee": "#B23A1E", "Disposal handling": "#B23A1E", "Avoided virgin product": "#597928"}


def breakdown(ledger, title, div, ylabel):
    d = ledger.groupby(["scenario", "category"])["value"].sum().reset_index()
    d["value"] = d["value"] / div
    f = px.bar(d, x="scenario", y="value", color="category", title=title, barmode="relative",
               labels={"value": ylabel, "scenario": ""}, color_discrete_map=COLORS)
    f.update_layout(height=380, margin=dict(l=0, r=0, t=40, b=0), legend_title="")
    return f


def sweep(key, values):
    rows = []
    for v in values:
        r = M.run_scenario(streams_in, pathways_in, rules_in, buyers_in, disposal_in, {**params, key: v})
        if r["status"] == "ok":
            rows.append(dict(value=v, diverted_pct=r["summary"]["diverted_pct"], em_change_t=r["summary"]["em_delta_t"]))
    return pd.DataFrame(rows)


with charts:
    st.subheader("Optimized plan vs simple disposal")
    c1, c2 = st.columns(2)
    c1.plotly_chart(breakdown(res["cost_ledger"], "Cost breakdown", 1e7, "₹ crore"), width="stretch")
    c2.plotly_chart(breakdown(res["em_ledger"], "Emissions breakdown", 1e3, "tCO₂e"), width="stretch")
    with st.expander("Per-stream numbers"):
        st.dataframe(res["by_stream"].rename(columns={
            "stream_id": "Stream", "name": "Name", "material": "Material", "tonnes": "Tonnes",
            "diverted_t": "Diverted t", "diverted_pct": "Diverted %", "net_cost_opt_inr": "Net cost optimized (₹)",
            "net_cost_base_inr": "Net cost disposal (₹)", "em_opt_t": "Emissions optimized (tCO₂e)",
            "em_base_t": "Emissions disposal (tCO₂e)", "em_change_t": "Emissions change (tCO₂e)"}).round(1),
            width="stretch", hide_index=True)
    with st.expander("What if…? Sensitivity"):
        sc1, sc2 = st.columns(2)
        cp = sweep("carbon_price", [0, 1000, 2500, 5000, 8000, 12000, 20000])
        if not cp.empty:
            f = px.line(cp, x="value", y="em_change_t", markers=True,
                        labels={"value": "Carbon price (₹/tCO₂e)", "em_change_t": "Emissions change (tCO₂e)"},
                        title="Carbon price → emissions change")
            f.update_layout(height=330, margin=dict(l=0, r=0, t=40, b=0))
            sc1.plotly_chart(f, width="stretch")
        tr = sweep("transport_cost", [1, 2, 3, 5, 8, 12])
        if not tr.empty:
            f = px.line(tr, x="value", y="diverted_pct", markers=True,
                        labels={"value": "Transport cost (₹/t-km)", "diverted_pct": "Waste diverted (%)"},
                        title="Transport cost → diversion")
            f.update_layout(height=330, margin=dict(l=0, r=0, t=40, b=0))
            sc2.plotly_chart(f, width="stretch")

# ---------------------------------------------------------------- explore: feasibility + methodology
with explore:
    st.subheader("Under the hood")
    tf, tm = st.tabs(["Feasibility check", "Methodology & audit"])
    with tf:
        f = res["feas_summary"].copy()
        f["cell"] = np.where(f["feasible"], "✅ feasible", "❌ " + f["reason"].str.slice(0, 70))
        mat = f.pivot(index="stream_id", columns="pathway", values="cell")
        mat = mat[[p for p in res["pathways"]["pathway"] if p in mat.columns]]
        names = res["streams"].set_index("stream_id")["name"]
        mat.insert(0, "Stream", mat.index.map(names))
        st.dataframe(mat, width="stretch")
        d1, d2 = st.columns(2)
        sid = d1.selectbox("Stream", res["streams"]["stream_id"], format_func=lambda x: f"{x} · {names[x]}")
        pname = d2.selectbox("Pathway", res["pathways"]["pathway"])
        det = res["feas_detail"]
        det = det[(det.stream_id == sid) & (det.pathway == pname)].copy()
        det["result"] = np.where(det["passed"], "✅ pass", "❌ fail")
        st.dataframe(det[["property", "value", "min", "max", "result", "reason"]], width="stretch", hide_index=True)
        st.caption("Thresholds are indicative; the source of each is in the `basis` column of the rules table.")
    with tm:
        st.markdown("One baseline, one scenario, one difference. Waste enters both systems with **zero upstream "
                    "burden** (cut-off rule: making the fly ash, slag or tailings is charged to the primary product).")
        st.latex(r"E_{base}=\sum_s t_s\,\big(h_{d(s)}+\delta_{s,d(s)}\,\varepsilon_t\big)")
        st.latex(r"E_{opt}=\sum_{(s,b)\in reuse} t_{sb}\big(\delta_{sb}\varepsilon_t+\pi_{p(b)}-\sigma_{p(b)}v_{p(b)}\big)"
                 r"+\sum_{(s,d)\in disp} t_{sd}\big(\delta_{sd}\varepsilon_t+h_d\big)")
        st.latex(r"\Delta E = E_{opt}-E_{base}\quad(\text{negative = reduction})")
        st.markdown("`t` tonnes · `δ` road km · `ε_t` transport kgCO₂e/t-km · `h` disposal handling · `π` processing · "
                    "`σ` substitution ratio · `v` emission factor of the displaced product.")
        st.markdown(
            "**How double counting is prevented**\n\n"
            "1. One credit per tonne: each tonne goes to exactly one destination (checks 1 and 4).\n"
            "2. The credit uses the substitution ratio, not the full product factor (check 5).\n"
            "3. Avoided disposal is not a second credit: disposal emissions sit only in the baseline (check 6).\n"
            "4. Waste carries zero upstream burden, so its production is never credited or charged.\n"
            "5. Transport and processing are always charged to the scenario that incurs them.")
        st.graphviz_chart("""digraph G { rankdir=LR; node [shape=box, style=rounded];
          subgraph cluster_b { label="Baseline"; style=dashed; W1 [label="Waste\\n(zero upstream burden)"];
            D [label="Transport + disposal handling"]; W1 -> D; }
          subgraph cluster_o { label="Optimized"; style=dashed; W2 [label="Waste\\n(zero upstream burden)"];
            R [label="Transport + processing"]; C [label="Credit: displaced product\\n(t x ratio x factor)"];
            X [label="Residual: transport + disposal"]; W2 -> R -> C; W2 -> X; }
          N [label="Net change = Optimized - Baseline", shape=ellipse]; D -> N; C -> N; R -> N; X -> N; }""")
        ck = res["checks"].copy()
        ck["result"] = np.where(ck["passed"], "✅ passed", "❌ FAILED")
        st.markdown("**Integrity checks**")
        st.dataframe(ck[["result", "check", "detail"]], width="stretch", hide_index=True)
        (st.success if ck["passed"].all() else st.error)(
            "All integrity checks passed: nothing is allocated, credited or counted twice."
            if ck["passed"].all() else "An integrity check failed. Review the inputs.")
        g1, g2 = st.columns(2)
        g1.dataframe(res["pathways"][["pathway_id", "pathway", "process_em_kg_t", "substitution_ratio",
                                      "displaced_product", "displaced_ef_kg_t"]], width="stretch", hide_index=True)
        g2.dataframe(res["disposal"][["site_id", "name", "handling_em_kg_t", "gate_fee_inr_t"]],
                     width="stretch", hide_index=True)
        st.caption("All factors are sample assumptions. Replace them with published values (IPCC, CEA India, "
                   "cement-industry data) and cite them before presenting.")
        which = st.radio("Ledger", ["Emissions (kgCO₂e)", "Cost (₹)"], horizontal=True)
        led = res["em_ledger"] if which.startswith("Emis") else res["cost_ledger"]
        st.dataframe(led[["scenario", "stream_id", "destination", "category", "tonnes", "unit", "unit_value",
                          "value", "basis"]].round(2), width="stretch", hide_index=True)
        st.download_button("Download ledger CSV", led.to_csv(index=False).encode("utf-8-sig"),
                           f"ledger_{'emissions' if which.startswith('Emis') else 'cost'}.csv", "text/csv")
