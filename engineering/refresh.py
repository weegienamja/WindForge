"""Administrative rebuild. Revisions never move implicitly; failures leave the active release intact."""

import json, subprocess, sys, urllib.request
from pathlib import Path
from db import transaction, one
from ingest import SPECS

here = Path(__file__).resolve().parent


def updates():
    current = [("IEAWindSystems/" + n, rev) for _, n, rev, *_ in SPECS] + [
        ("IEAWindSystems/windIO", "63dcad638a9ac41d24f7a68172e24bde378c23e6"),
        ("OpenFAST/openfast", "2895884d2be01862173c88d70f86b358d2f1a50a"),
    ]
    result = []
    for repo, pin in current:
        req = urllib.request.Request(
            "https://api.github.com/repos/" + repo + "/commits/HEAD",
            headers={"User-Agent": "WindForge-source-monitor"},
        )
        with urllib.request.urlopen(req, timeout=15) as f:
            head = json.load(f)["sha"]
        result.append(
            {"repo": repo, "pinned": pin, "head": head, "review": head != pin}
        )
    return result


if __name__ == "__main__":
    check = "--check" in sys.argv
    job = transaction(
        lambda c: one(
            c,
            "INSERT INTO ingestion(release,status) VALUES(NULL,%s) RETURNING id",
            ("checking" if check else "extracting",),
        )
    )
    try:
        if check:
            result = updates()
            detail = json.dumps(result)
            status = (
                "revision-review" if any(x["review"] for x in result) else "up-to-date"
            )
        else:
            subprocess.run(
                [sys.executable, str(here / "ingest.py")], check=True, cwd=here
            )
            subprocess.run(
                [sys.executable, str(here / "load.py"), str(here / "catalogue.json")],
                check=True,
                cwd=here,
            )
            status = "complete"
            detail = "Pinned sources validated and released"
        transaction(
            lambda c: c.execute(
                "UPDATE ingestion SET status=%s,detail=%s WHERE id=%s",
                (status, detail, job),
            )
        )
        print(status)
    except Exception as exc:
        transaction(
            lambda c: c.execute(
                "UPDATE ingestion SET status='failed',detail=%s WHERE id=%s",
                (type(exc).__name__, job),
            )
        )
        raise
