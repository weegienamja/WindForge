"""Production acceptance of drill-down, evidence provenance and wrapped source rows."""
import json
import os
from pathlib import Path
from playwright.sync_api import expect, sync_playwright

base = os.environ.get("WF_BASE", "https://windforge.khmer-iq.workers.dev")
out = Path(os.environ["WF_ARTIFACTS"])
out.mkdir(parents=True, exist_ok=True)
expect.set_options(timeout=20000)

with sync_playwright() as pw:
    browser = pw.chromium.launch(executable_path=os.getenv("WF_CHROME"))
    p = browser.new_page(viewport={"width":1440, "height":960})
    errors = []
    p.on("pageerror", lambda e: errors.append(str(e)))
    def press(name):
        p.get_by_role("button", name=name, exact=True).click()
    def heading(name):
        expect(p.get_by_role("heading", name=name, exact=True)).to_be_visible()
    def up(name):
        p.get_by_role("navigation",name="Assembly path").get_by_role("button",name=name,exact=True).click()

    p.goto(base)
    press("Inspect nacelle")
    heading("Nacelle and drivetrain")
    p.screenshot(path=out/"nacelle.png",full_page=True)
    press("Inspect gearbox")
    heading("Gearbox")
    expect(p.get_by_text("97:1",exact=True)).to_be_visible()
    press("Inspect stage 2")
    heading("Gear stages")
    expect(p.get_by_text("Stage 2",exact=True)).to_be_visible()
    press("Inspect gearbox bearings")
    heading("Gearbox bearings")
    expect(p.get_by_text("Separate research assembly",exact=True).first).to_be_visible()
    press("Rolling elements")
    expect(p.get_by_text("The rollers carry load",exact=False)).to_be_visible()
    with p.expect_download() as download:
        press("Export finding")
    data = json.loads(Path(download.value.path()).read_bytes())
    assert data["finding"]["title"] == "Axial cracking in gearbox bearings"
    assert any(s["id"]=="grc-cracks" for s in data["sources"])
    p.screenshot(path=out/"gearbox-bearing-investigation.png",full_page=True)
    press("Investigate this finding")
    press("Check evidence")
    expect(p.get_by_text("Research evidence",exact=True)).to_be_visible()
    expect(p.get_by_text("Evidence to compare:",exact=False)).to_be_visible()
    press("Turbine explorer")
    up("Nacelle and drivetrain")
    press("Inspect main bearings")
    for identifier in ("Main bearing 1 · CARB", "Main bearing 2 · SRB"):
        press(identifier+" ›")
        heading(identifier)
        expect(p.get_by_role("link",name="SKF",exact=False).first).to_be_visible()
        up("Main bearings")
    up("Nacelle and drivetrain")
    press("Inspect generator")
    press("Inspect stator and windings")
    heading("Stator and windings")
    press("Reduced generator cooling")
    expect(p.get_by_text("A ventilation fault",exact=False)).to_be_visible()
    press("Inspect generator rotor")
    heading("Generator rotor")
    p.reload()
    heading("Generator rotor")
    for model in ("iea15", "iea22"):
        p.get_by_role("combobox", name="Reference design").select_option(model)
        press("Inspect nacelle")
        expect(p.get_by_role("button",name="Inspect gearbox",exact=True)).to_have_count(0)
        press("Inspect generator")
        heading("Generator")

    press("Source library")
    for width in (1440,1050,850,390):
        p.set_viewport_size({"width":width,"height":850})
        buttons=p.locator(".wf-source-list button")
        expect(buttons.first).to_be_visible()
        bounds=buttons.evaluate_all("""buttons=>buttons.map(b=>{
            const row=b.getBoundingClientRect(), title=b.querySelector('span').getBoundingClientRect();
            const text=document.createRange();text.selectNodeContents(b.querySelector('span'));
            const lines=[...text.getClientRects()];
            return {height:row.height, content:title.height, wrapped:lines.length>1,
                inside:lines.every(r=>r.bottom<=row.bottom+1 && r.top>=row.top-1 && r.right<=row.right+1),
                top:row.top,bottom:row.bottom};
        })""")
        assert len(bounds)>=22 and any(b["wrapped"] for b in bounds)
        assert all(b["inside"] for b in bounds) and all(a["bottom"]<=b["top"]+1 for a,b in zip(bounds,bounds[1:])),(width,bounds)
        assert p.evaluate("document.documentElement.scrollWidth<=innerWidth")
        if width in (1050,390):
            p.screenshot(path=out/("source-list-"+str(width)+".png"))
    buttons.last.click()
    expect(buttons.last).to_have_attribute("aria-pressed","true")
    p.goto(base+"/engineering?view=turbines&model=iea34&component=gearbox-bearings")
    heading("Gearbox bearings")
    assert p.evaluate("document.documentElement.scrollWidth<=innerWidth")
    assert not errors,errors
    browser.close()
print("Passed turbine, nacelle, gearbox stages, bearings, generator, all three designs, grounded answer, evidence export, reload and source list at four widths.")
