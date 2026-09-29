# Methodology

## 1. Feasibility
For each (stream, pathway) pair the app checks that the material type is accepted and that every property
rule (`min`/`max`) in `data/rules.csv` passes. Derived properties: `sum_oxides = SiO2+Al2O3+Fe2O3` and
`basicity = (CaO+MgO)/SiO2`. A missing value fails the rule. Thresholds are indicative and cite their basis.

## 2. Allocation (linear program)
Variables: tonnes `x` for every feasible stream→buyer arc and every stream→disposal-site arc.
Minimise `Σ (cost_per_t + λ·em_per_t) · x` where `λ = carbon price / 1000` (₹ per kgCO₂e).
Constraints: each stream is fully allocated; each buyer receives at most its demand cap; optional minimum diversion share.
Unit cost of a reuse arc = `distance × ₹/t-km + processing − buyer price`. Disposal arc = `distance × ₹/t-km + gate fee`.
Solver: SciPy `linprog` (HiGHS).

## 3. Baseline
Every stream goes entirely to its cheapest disposal site (gate fee + transport).

## 4. Net emissions
```
E_base = Σ_s t_s · (h_d + δ_sd · ε_t)
E_opt  = Σ_reuse t_sb · (δ_sb · ε_t + π_p − σ_p · v_p)  +  Σ_disposal t_sd · (δ_sd · ε_t + h_d)
ΔE     = E_opt − E_base        (negative = reduction)
```
`t` tonnes · `δ` road km · `ε_t` transport kgCO₂e/t-km · `h` disposal handling · `π` processing ·
`σ` substitution ratio (t displaced product per t waste) · `v` emission factor of the displaced product.

### No double counting
1. **Cut-off rule:** waste carries zero upstream burden in both systems.
2. **One credit per tonne:** each tonne has one destination, so it earns the avoided-product credit once.
3. **Substitution ratio:** credit = `t × σ × v`, never `t × v`.
4. **Avoided disposal is not a credit:** disposal emissions exist only in the baseline; the scenario simply does not incur them, so the benefit appears once in `ΔE`.
5. **Transport and processing** are always charged to the scenario that incurs them.

The app verifies this with 8 automatic checks (mass balance, capacity, feasibility, one credit per tonne,
credit recomputed from the pathway table, no avoided-disposal line, ledger reconciliation, objective reproduction).

## 5. Limitations
- Distances are straight-line × a road factor, not routed.
- One period, deterministic prices and demand.
- Emission factors, prices and thresholds are sample values to be replaced with sourced data.
