"""Atomic release switch; reruns deduplicate and retain earlier source revisions."""

import json, sys, hashlib
from pathlib import Path
from db import transaction, one, Json, Encoder


def main(path):
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    rel = data.pop("release")
    if (
        hashlib.sha256(json.dumps(data, sort_keys=True).encode()).hexdigest()[:16]
        != rel
    ):
        raise ValueError("Release digest mismatch")
    data["release"] = rel
    job = transaction(
        lambda c: one(
            c,
            "INSERT INTO ingestion(release,status) VALUES(%s,'running') RETURNING id",
            (rel,),
        )
    )

    def load(c):
        c.execute("SELECT pg_advisory_xact_lock(7106421)")
        if not one(c, "SELECT 1 FROM releases WHERE id=%s", (rel,)):
            c.execute(
                "INSERT INTO releases VALUES(%s,%s,now())",
                (
                    rel,
                    Json(
                        {
                            "version": data["version"],
                            "encoder": "Xenova/all-MiniLM-L6-v2@751bff37182d3f1213fa05d7196b954e230abad9",
                        }
                    ),
                ),
            )
            for key, s in data["sources"].items():
                c.execute("INSERT INTO source VALUES(%s,%s,%s)", (rel, key, Json(s)))
            for m in data["models"]:
                c.execute(
                    "INSERT INTO turbine VALUES(%s,%s,%s)",
                    (rel, m["id"], Json({k: v for k, v in m.items() if k != "nodes"})),
                )
                for n in m["nodes"]:
                    c.execute(
                        "INSERT INTO component VALUES(%s,%s,%s,%s,%s)",
                        (rel, m["id"], n["id"], n["parent"], Json(n)),
                    )
                if digest := m.get("bladeAsset"):
                    raw = (Path(path).parent / "geometry" / (digest + ".json")).read_bytes()
                    if hashlib.sha256(raw).hexdigest() != digest:
                        raise ValueError("Blade geometry digest mismatch")
                    c.execute(
                        "INSERT INTO blade_geometry VALUES(%s,%s,%s)",
                        (rel, m["id"], Json(json.loads(raw))),
                    )
            enc = Encoder()
            for p in data["passages"]:
                c.execute(
                    "INSERT INTO evidence VALUES(%s,%s,%s,%s,%s,%s,%s::vector)",
                    (
                        rel,
                        p["id"],
                        p["scope"],
                        p["source"],
                        p["locator"],
                        p["text"],
                        enc.vector(p["text"]),
                    ),
                )
        if not one(c, "SELECT 1 FROM specification WHERE release=%s LIMIT 1", (rel,)):
            encoder = Encoder()
            seen = {}
            for m in data["models"]:
                for n in m["nodes"]:
                    for f in n["facts"]:
                        field = f["field"].replace("_", " ")
                        phrase = f"What is the {field} of the {n['label']}?"
                        if phrase not in seen:
                            seen[phrase] = encoder.vector(phrase)
                        c.execute(
                            "INSERT INTO specification VALUES(%s,%s,%s,%s,%s,%s,%s,%s,%s::vector)",
                            (
                                rel,
                                m["id"],
                                n["id"],
                                f["path"],
                                f["field"],
                                Json(f["value"]),
                                f["unit"],
                                f.get("line"),
                                seen[phrase],
                            ),
                        )
        c.execute(
            "INSERT INTO active VALUES(true,%s) ON CONFLICT(singleton) DO UPDATE SET release=excluded.release",
            (rel,),
        )
        c.execute("UPDATE ingestion SET status='complete' WHERE id=%s", (job,))

    try:
        transaction(load)
    except Exception as e:
        transaction(
            lambda c: c.execute(
                "UPDATE ingestion SET status='failed',detail=%s WHERE id=%s",
                (type(e).__name__, job),
            )
        )
        raise
    print("Active knowledge release", rel)


if __name__ == "__main__":
    main(sys.argv[1])
