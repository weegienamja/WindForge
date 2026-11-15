"""Live browser acceptance. Creates a fresh isolated browser workspace; no mocked requests."""

import json, os, sys
from pathlib import Path
from playwright.sync_api import sync_playwright, expect

base = os.environ.get("WF_BASE", "https://windforge.khmer-iq.workers.dev")
out = Path(os.environ["WF_ARTIFACTS"])
out.mkdir(exist_ok=True, parents=True)
expect.set_options(timeout=90000)
with sync_playwright() as pw:
    browser = pw.chromium.launch(
        executable_path=os.environ.get("WF_CHROME"), args=["--disable-gpu"]
    )
    desktop = browser.new_context(
        viewport={"width": 1440, "height": 1000}, accept_downloads=True
    )
    p = desktop.new_page()
    p.set_default_timeout(90000)
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    p.goto(base + "/analyse?lat=58.45&lng=-3.65&hub=100", wait_until="domcontentloaded")
    p.get_by_role("link", name="Investigate turbine fit").click()
    expect(p.get_by_role("heading", name="Site evidence")).to_be_visible()
    p.get_by_role("button", name="Analyse site", exact=True).click()
    expect(
        p.get_by_text("Site evidence saved to this browser workspace.")
    ).to_be_visible()
    p.get_by_role("button", name="Turbine explorer", exact=True).click()
    p.get_by_label("Reference design").select_option("iea34")
    p.get_by_role("button", name="Inspect gearbox").click()
    expect(p.get_by_role("heading", name="Gearbox", exact=True)).to_be_visible()
    p.screenshot(path=out / "turbine-explorer.png", full_page=True)
    p.get_by_role("button", name="Use in configuration A").click()
    p.get_by_label("Site setting").select_option("onshore")
    p.get_by_label("Comparison title").fill(
        "Caithness Â· six and four reference turbines"
    )
    p.get_by_role("button", name="Calculate and save comparison").click()
    expect(p.get_by_role("heading", name="Comparison result")).to_be_visible()
    p.screenshot(path=out / "site-comparison.png", full_page=True)
    p.get_by_role("button", name="Ask about this result").click()
    p.get_by_label("Question", exact=True).fill("What is the gearbox ratio?")
    p.get_by_role("button", name="Check evidence").click()
    expect(p.get_by_text("Documented fact", exact=True)).to_be_visible()
    p.get_by_label("Question", exact=True).fill("Compare net energy yield")
    p.get_by_role("button", name="Check evidence").click()
    expect(p.get_by_text("Calculated result", exact=True)).to_be_visible()
    with p.expect_download() as dl:
        p.get_by_role("button", name="Download comparison with evidence").click()
    dl.value.save_as(out / "Caithness-comparison.md")
    with p.expect_download() as dl:
        p.get_by_role("button", name="Export investigation").click()
    dl.value.save_as(out / "Caithness-investigation.json")
    artifact = json.loads(
        (out / "Caithness-investigation.json").read_text(encoding="utf-8")
    )
    report = artifact["report"]
    assert len(report["cases"]) == 2
    assert all(c["energy"] is not None for c in report["cases"]), report["site"][
        "metadata"
    ]["sourcesFailed"]
    assert any("97" in a["text"] for a in artifact["answers"])
    print(
        "Comparison",
        [
            (c["label"], c["capacityMw"], c["energy"]["netTotalAepMwh"])
            for c in report["cases"]
        ],
        "delta",
        report["deltaMwh"],
        flush=True,
    )

    def api(ctx, op, **args):
        return ctx.request.post(
            base + "/api/engineering", data={"op": op, **args}, timeout=85000
        )

    entries = api(desktop, "list").json()
    comp = next(e for e in entries if e["kind"] == "comparison")
    other = browser.new_context(viewport={"width": 390, "height": 844})
    assert api(other, "get", id=comp["id"]).status == 404
    assert api(other, "journal", id=comp["id"]).json() == []
    assert api(other, "remove", id=comp["id"]).status == 404
    own = api(
        desktop,
        "record",
        model="iea34",
        component="gearbox",
        text="note,velocity [mm/s]\ninspection pending,1.2\nfixture,2.4",
        title="isolation-test.csv",
        provenance="Browser acceptance fixture only",
    )
    assert own.ok
    rec = own.json()["id"]
    assert api(other, "get", id=rec).status == 404
    assert (
        api(
            desktop,
            "ask",
            model="iea15",
            component="generator",
            recordId=rec,
            question="What are the specifications?",
        ).status
        == 404
    )
    unsupported = api(
        desktop,
        "ask",
        model="iea34",
        component="gearbox",
        scope="grc",
        question="Can I repair this gearbox?",
    ).json()
    assert unsupported["type"] == "Unresolved"
    grc = api(
        desktop,
        "ask",
        model="iea34",
        component="gearbox",
        scope="grc",
        recordId=rec,
        question="Which bearing measurements distinguish drivetrain vibration at different loads?",
    ).json()
    private_url = "/engineering?item=" + rec
    assert any(s["url"] == private_url for s in grc["citations"])
    evidence = [s for s in grc["citations"] if s["url"] != private_url]
    assert evidence and all(
        "openei.org" in s["url"] or "nlr.gov" in s["url"] or "energy.gov" in s["url"]
        for s in evidence
    )
    assert "inspection pending" in grc["record"]
    assert "1.2 to 2.4 (2 numeric observations" in grc["record"]
    v = api(
        desktop,
        "recalculate",
        reportId=comp["id"],
        question="replace four turbines with three turbines",
    ).json()
    assert [c["config"]["count"] for c in v["report"]["cases"]] == [4, 3]
    p.get_by_role("button", name="Saved work", exact=True).click()
    p.get_by_role("button", name=comp["title"], exact=True).click()
    expect(p.get_by_role("heading", name="Comparison result")).to_be_visible()
    pp = other.new_page()
    pp.goto(base + "/engineering")
    expect(pp.get_by_role("heading", name="Turbine assembly")).to_be_visible()
    pp.get_by_label("Reference design").select_option("iea22")
    pp.get_by_label("Assembly or component").select_option("generator")
    expect(pp.get_by_role("heading", name="Generator", exact=True)).to_be_visible()
    assert pp.evaluate("document.documentElement.scrollWidth<=window.innerWidth")
    pp.screenshot(path=out / "mobile-explorer.png", full_page=True)
    assert not errors, errors
    print(
        "Passed: desktop and phone; source drilldown; calculations, exports, question history, scoped semantic retrieval, unsupported repair, private ownership and recalculation.",
        flush=True,
    )
    browser.close()
