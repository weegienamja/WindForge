"""Live parcel and receptor path with user-drawn test geometry (not a cadastral boundary)."""

import json, os
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

out = Path(os.environ["WF_ARTIFACTS"])
base = os.environ.get("WF_BASE", "https://windforge.khmer-iq.workers.dev")
expect.set_options(timeout=90000)
with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.environ.get("WF_CHROME"))
    ctx = browser.new_context(viewport={"width": 1360, "height": 900})
    p = ctx.new_page()
    p.set_default_timeout(90000)
    p.goto(base + "/engineering")
    p.get_by_role("button", name="Site comparison", exact=True).click()
    p.get_by_role("button", name="Analyse site", exact=True).click()
    expect(
        p.get_by_text("Site evidence saved to this browser workspace.")
    ).to_be_visible()
    fields = p.get_by_label("Reference turbine")
    fields.nth(1).select_option("iea34")
    p.get_by_label("Count", exact=True).nth(0).fill("2")
    p.get_by_label("Count", exact=True).nth(1).fill("2")
    p.get_by_label("Boundary partition").nth(0).select_option("west")
    p.get_by_label("Boundary partition").nth(1).select_option("east")
    p.get_by_label("Site setting").select_option("onshore")
    p.get_by_label("Comparison title").fill(
        "Caithness degree-box screening · west / east"
    )
    p.get_by_text("Parcel, site bisect and receptor", exact=True).click()
    p.get_by_label("Parcel GeoJSON").fill(
        json.dumps(
            {
                "type": "Polygon",
                "coordinates": [
                    [
                        [-3.68, 58.435],
                        [-3.62, 58.435],
                        [-3.62, 58.465],
                        [-3.68, 58.465],
                        [-3.68, 58.435],
                    ]
                ],
            }
        )
    )
    p.get_by_label("Receptor latitude, longitude").fill("58.45, -3.65")
    with p.expect_response(
        lambda r: (
            "/api/engineering" in r.url
            and r.request.method == "POST"
            and r.request.post_data_json.get("op") == "compare"
        ),
        timeout=90000,
    ) as rep:
        p.get_by_role("button", name="Calculate and save comparison").click()
    r = rep.value
    assert r.ok, (r.status, r.text())
    report = r.json()["report"]
    g = report["geometry"]
    print(
        "Parcel",
        g["source"],
        g["stamp"],
        [
            (
                c["layoutCount"],
                len(c["positions"]),
                c["shadowHours"],
                c["energy"]["netTotalAepMwh"] if c["energy"] else None,
            )
            for c in report["cases"]
        ],
        flush=True,
    )
    assert g["zones"] is not None
    assert all(
        len(c["positions"]) == 2
        and c["shadowHours"] is not None
        and c["energy"] is not None
        for c in report["cases"]
    )
    assert all(loc["lng"] < -3.65 for loc in report["cases"][0]["positions"]) and all(
        loc["lng"] >= -3.65 for loc in report["cases"][1]["positions"]
    )
    expect(p.get_by_role("heading", name="Comparison result")).to_be_visible()
    with p.expect_download() as dl:
        p.get_by_role("button", name="Export JSON", exact=True).click()
    dl.value.save_as(out / "Caithness-parcel.json")
    p.screenshot(path=out / "parcel-comparison.png", full_page=True)
    browser.close()
