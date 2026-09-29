# ♻️ Waste-to-Value Optimizer

**ENR-04: Industrial Waste Reuse & Circular-Economy Optimization.**
Matches fly ash, slag and mine tailings to feasible reuse pathways, decides how many tonnes go where
(linear program), and compares the outcome with simple disposal on **waste diverted, net cost (₹) and
net CO₂e**, with an emissions ledger anyone can audit.

![Dashboard](docs/screenshots/dashboard.png)
<!-- Add screenshots: docs/screenshots/dashboard.png, flow.png, map.png -->

## What it does
1. **Input:** waste quantity, composition (oxides, LOI, moisture, sulphur, glass content) and location.
2. **Feasibility:** checks every stream against the property limits of 5 reuse pathways (cement blending, GGBS, bricks, road sub-base, mine backfill), with pass/fail per property.
3. **Allocation:** minimum-cost linear program including transport (₹/t-km), processing, buyer prices and demand caps. Optional carbon price and minimum-diversion target.
4. **Comparison:** diverted tonnes, net cost and emissions change vs disposal, plus an impact panel.
5. **Transparent emissions:** one baseline, one scenario, one difference. Eight automatic integrity checks prove nothing is double counted. See [docs/methodology.md](docs/methodology.md).

## Run locally (Windows)
1. Install Python 3.10 or newer from python.org. On the first installer screen, tick "Add python.exe to PATH".
2. Right-click the downloaded zip, choose "Extract All", then Extract.
3. Open the extracted folder until you see `app.py`.
4. Click the folder's address bar, type `cmd`, press Enter. A Command Prompt opens inside the folder.
5. Run `pip install -r requirements.txt`.
6. Run `streamlit run app.py`. The app opens at http://localhost:8501.

## Project layout
| Path | Purpose |
|---|---|
| `app.py` | Streamlit interface |
| `model.py` | Feasibility, optimizer, ledgers, integrity checks |
| `data/` | Sample streams, pathways, rules, buyers, disposal sites (all editable in the app) |
| `docs/methodology.md` | Emissions and cost method, assumptions, limitations |
| `.streamlit/config.toml` | Light and dark themes in a brown, sage, olive, cream palette (switch under the top-right menu → Settings) |

## Tech stack
Python · Streamlit · pandas / NumPy · SciPy (HiGHS LP) · Plotly (Sankey, maps, charts)

## Data & assumptions
All prices, costs, emission factors and property limits in `data/` are **sample assumptions** for the
prototype. Replace them with sourced values (IS 3812, IS 12089, IPCC, CEA India) before real use.

## Roadmap
- Road distances via OSRM instead of straight-line × factor
- Time-phased supply and buyer demand
- Real buyer/plant database import
