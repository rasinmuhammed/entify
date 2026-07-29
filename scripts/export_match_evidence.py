"""Export real per-field match evidence for the landing page explorer."""
import sys, json, logging, math, tempfile, os
sys.path.insert(0, "/Users/muhammedrasin/entify/backend")
logging.basicConfig(level=logging.CRITICAL)

import autoconfig
from engine import EntityResolutionEngine
from sample_data import generate
from services.splink_service import SplinkService

df = generate(n_entities=2000, duplicate_rate=0.18, seed=42, include_ground_truth=True)
truth = dict(zip(df["customer_id"], df["true_entity_id"]))
csv = df.drop(columns=["true_entity_id"]).to_csv(index=False)

with tempfile.NamedTemporaryFile("w", suffix=".csv", delete=False) as t:
    t.write(csv); path = t.name
e0 = EntityResolutionEngine(); e0.ingest_data(path, "customers")
cfg = autoconfig.generate(e0, "customers"); e0.close(); os.unlink(path)

settings = dict(cfg.settings)
settings["retain_intermediate_calculation_columns"] = True

svc = SplinkService()
res = svc.process_entity_resolution(csv, settings, 0.5, "customers", "customer_id")
assert res["status"] == "success", res.get("error")
preds = svc.engine.predictions_df()
print("cols with bf_:", [c for c in preds.columns if c.startswith("bf_")])

FIELDS = ["first_name", "last_name", "email", "phone", "address", "city", "country", "signup_date"]
LEVEL_LABELS = {
    -1: "null", 0: "no match", 1: "similar", 2: "very similar", 3: "exact", 4: "exact",
}

def build(row):
    fields = []
    for f in FIELDS:
        bf_col = f"bf_{f}"
        if bf_col not in preds.columns:
            continue
        bf = float(row[bf_col])
        gamma = int(row[f"gamma_{f}"])
        weight = math.log2(bf) if bf > 0 else -10.0
        fields.append({
            "field": f,
            "left": None if row[f"{f}_l"] is None else str(row[f"{f}_l"]),
            "right": None if row[f"{f}_r"] is None else str(row[f"{f}_r"]),
            "level": LEVEL_LABELS.get(gamma, f"level {gamma}"),
            "weight": round(weight, 2),
        })
    # The waterfall must add up: match_weight is the prior plus every field's
    # contribution. Omitting either makes the arithmetic visibly wrong.
    total_field_weight = sum(f["weight"] for f in fields)
    prior = round(float(row["match_weight"]) - total_field_weight, 2)
    return {
        "prior": prior,
        "leftId": str(row["customer_id_l"]),
        "rightId": str(row["customer_id_r"]),
        "matchWeight": round(float(row["match_weight"]), 2),
        "probability": round(float(row["match_probability"]), 5),
        "isTrueMatch": truth.get(row["customer_id_l"]) == truth.get(row["customer_id_r"]),
        "fields": fields,
    }

sorted_preds = preds.sort_values("match_probability", ascending=False)
picked, seen_sig = [], set()

def sig(row):
    return tuple(int(row[f"gamma_{f}"]) for f in FIELDS if f"gamma_{f}" in preds.columns)

# A confident match, a mid-confidence one, and a genuine near-miss.
buckets = [
    ("strong", sorted_preds[sorted_preds["match_probability"] > 0.999]),
    ("moderate", sorted_preds[(sorted_preds["match_probability"] > 0.5) & (sorted_preds["match_probability"] < 0.999)]),
    ("weak", sorted_preds[sorted_preds["match_probability"] < 0.2]),
]
for label, frame in buckets:
    for _, row in frame.iterrows():
        s = sig(row)
        if s in seen_sig:
            continue
        item = build(row)
        # Only keep pairs where at least one field disagrees, so the evidence
        # breakdown actually shows a trade-off rather than six exact matches.
        if label != "strong" or any(f["weight"] < 0 for f in item["fields"]):
            seen_sig.add(s)
            item["bucket"] = label
            picked.append(item)
            break

# Top up with a couple more varied strong matches.
for _, row in buckets[0][1].iterrows():
    if len(picked) >= 4:
        break
    s = sig(row)
    if s in seen_sig:
        continue
    seen_sig.add(s)
    item = build(row); item["bucket"] = "strong"
    picked.append(item)

out = {"pairs": picked}
p = "/Users/muhammedrasin/entify/frontend/lib/matchEvidence.json"
json.dump(out, open(p, "w"), indent=1)
print(f"wrote {p} with {len(picked)} pairs")
for item in picked:
    print(f"  {item['bucket']:9} {item['leftId']}/{item['rightId']} "
          f"w={item['matchWeight']:6.2f} p={item['probability']:.4f} true={item['isTrueMatch']}")
    for f in item["fields"]:
        print(f"      {f['field']:<11} {f['level']:<12} {f['weight']:+6.2f}  "
              f"{str(f['left'])[:22]!r} vs {str(f['right'])[:22]!r}")
