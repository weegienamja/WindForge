"""Live, read-only engineering journeys from the public front door."""
import json
import os
from pathlib import Path

from playwright.sync_api import expect, sync_playwright

ROOT = Path(__file__).resolve().parents[1]
catalogue = json.loads((ROOT / "catalogue.json").read_text(encoding="utf-8"))
base = os.getenv("WF_BASE", "https://windforge.khmer-iq.workers.dev")
out = Path(os.environ["WF_ARTIFACTS"])
out.mkdir(exist_ok=True, parents=True)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("WF_CHROME"))
    page = browser.new_page(viewport={"width": 1440, "height": 960}, accept_downloads=True)
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base)
    expect(page.get_by_role("heading", name="Blade sections")).to_be_visible(timeout=25000)
    for model in catalogue["models"]:
        geometry = json.loads((ROOT / "geometry" / (model["bladeAsset"] + ".json")).read_bytes())
        page.get_by_label("Reference design").select_option(model["id"])
        station = page.get_by_role("combobox", name="Reference section", exact=True)
        expect(station.locator("option")).to_have_count(len(geometry["stations"]))
        station.select_option(str(len(geometry["stations"]) - 1))
        tip = geometry["stations"][-1]["name"]
        expect(page.get_by_role("img", name=tip + " normalised airfoil section")).to_be_visible()
        page.get_by_role("button", name="Twist", exact=True).click()
        expect(page.get_by_text("View " + str(len(geometry["distributions"]["twist"])) + " source values")).to_be_visible()
        with page.expect_download() as downloaded:
            page.get_by_role("button", name="Download geometry").click()
        export = json.loads(Path(downloaded.value.path()).read_bytes())
        assert export["profiles"][tip] == geometry["profiles"][tip]
        assert export["distributions"] == geometry["distributions"]
        assert export["sourceUrl"] == catalogue["sources"][model["definition"]]["url"]
    page.screenshot(path=out / "blade-sections-desktop.png")
    page.get_by_role("button", name="Inspect blade assembly").click()
    expect(page.get_by_role("heading", name="Blade", exact=True)).to_be_visible()
    page.get_by_role("button", name="Source library", exact=True).click()
    page.get_by_role("combobox", name="Collection", exact=True).select_option("grc")
    page.get_by_label("Search sources and passages").fill("axial cracking")
    expect(page.get_by_role("heading", name="Gearbox instrumentation for the investigation of bearing axial cracking")).to_be_visible()
    expect(page.get_by_text("Abstract · NREL/TP-5000-70639")).to_be_visible()
    with page.expect_download() as downloaded:
        page.get_by_role("button", name="Export selected evidence").click()
    export = json.loads(Path(downloaded.value.path()).read_bytes())
    assert export["source"]["id"] == "grc-cracks" and export["passages"][0]["source"] == "grc-cracks"
    page.screenshot(path=out / "gearbox-source-library.png")
    page.get_by_role("button", name="Investigate this collection").click()
    expect(page.get_by_label("Evidence scope")).to_have_value("grc")
    expect(page.get_by_label("Assembly or component")).to_have_value("gearbox")
    for width in (768, 390):
        page.set_viewport_size({"width":width,"height":844})
        page.goto(base + "/engineering?view=blades&model=iea15")
        expect(page.get_by_role("combobox", name="Reference section", exact=True)).to_be_visible()
        expect(page.get_by_label("Reference design")).to_have_value("iea15")
        assert page.evaluate("document.documentElement.scrollWidth <= innerWidth")
        page.screenshot(path=out / ("blade-sections-" + str(width) + ".png"),full_page=True)
    assert not errors, errors
    browser.close()
print("Passed landing, three original blade datasets, export provenance, gearbox research drill-down and responsive deep links.")
