"""Exercise a running WindForge designer using Playwright for Python and Chromium.

python -m pip install playwright
python -m playwright install chromium
python packages/demo/tests/browser/designer.py http://localhost:3000
"""
import argparse
import re
import json
from urllib.parse import parse_qs, urlparse

from playwright.sync_api import expect, sync_playwright


def exercise(page, base):
    errors = []
    page.on("pageerror", lambda error: errors.append(str(error)))
    page.goto(base + "/designer", wait_until="domcontentloaded")
    button = lambda name: page.get_by_role("button", name=name, exact=True)
    comparison = page.get_by_role("table")
    area = page.locator(".farm-map.leaflet-container")

    def values(label):
        row = comparison.get_by_role("row", name=re.compile("^" + label))
        return row.locator("td").all_text_contents()

    def ready():
        expect(page.locator(".farm-section-heading [role=status]")).to_have_text(
            re.compile(r"^\d+ layouts$"), timeout=45000
        )

    def map_click(x, y):
        area.scroll_into_view_if_needed()
        size = area.bounding_box()
        area.click(position={"x": size["width"] * x, "y": size["height"] * y})

    ready()
    expect(area.locator("[title='Turbine 1']")).to_be_visible()
    original = values("Net annual energy")
    assert len(original) == 2 and original[0] != original[1] and "—" not in original
    assert values("Installed capacity")[0] == values("Installed capacity")[1]
    assert values("Theoretical shadow")[0] != values("Theoretical shadow")[1]

    button("Draw parcel").click()
    for x, y in [(0.24, 0.1), (0.75, 0.1), (0.75, 0.90), (0.24, 0.90)]:
        map_click(x, y)
    button("Finish boundary").click()
    ready()
    assert values("Net annual energy") == original

    button("Duplicate").click()
    page.get_by_text("Layout name & costs", exact=True).click()
    page.get_by_label("Layout name", exact=True).fill("Ridge revision")
    page.get_by_label("Capital cost (£/MW)", exact=True).fill("1550000")
    button("Save settings").click()
    ready()
    assert values("Net annual energy") == [*original, original[0]]
    assert values("Levelised cost")[0] != values("Levelised cost")[2]

    marker = area.locator("[title='Turbine 1']")
    marker.scroll_into_view_if_needed()
    box = marker.bounding_box()
    x, y = box["x"] + box["width"] / 2, box["y"] + box["height"] / 2
    page.mouse.move(x, y)
    page.mouse.down()
    page.mouse.move(x + 27, y - 17, steps=12)
    page.mouse.up()
    ready()
    moved = values("Net annual energy")
    assert moved[:2] == original and moved[2] != original[0]

    button("+ New layout").click()
    map_click(0.48, 0.47)
    map_click(0.56, 0.55)
    button("Select / move").click()
    page.get_by_label("Select turbine").select_option("0")
    page.get_by_text("Edit coordinates", exact=True).click()
    fields = page.locator(".farm-point")
    fields.get_by_label("Latitude").fill("58.4505")
    fields.get_by_label("Longitude").fill("-3.646")
    button("Move turbine").click()
    ready()
    assert values("Turbines") == ["4", "4", "4", "2"]
    expect(comparison.get_by_text("—", exact=True)).to_have_count(0)

    button("Receptor").click()
    map_click(0.6, 0.48)
    ready()
    page.get_by_label("Turbine model").select_option("iea34")
    ready()
    assert values("Receptor sound")[-1] == "—" and values("Net annual energy")[-1] != "—"
    page.get_by_label("Turbine model").select_option("vestas-v90-2000")
    page.get_by_label("Hub height").select_option("105")
    ready()
    absolute = values("Net present value")
    page.get_by_label("Compare values").select_option(label="Difference from West ridge")
    assert values("Net present value")[0] == "0"
    assert values("Net present value")[-1] != absolute[-1]
    expect(comparison.get_by_text("Directional wake loss pp")).to_be_visible()
    page.get_by_label("Compare values").select_option(label="Absolute values")
    page.reload(wait_until="domcontentloaded")
    ready()
    assert values("Net present value") == absolute
    expect(page.get_by_label("Hub height")).to_have_value("105")
    expect(page.get_by_role("columnheader", name="Ridge revision")).to_be_visible()
    page.get_by_label("Select turbine").select_option("1")
    button("Remove T2").click()
    ready()
    assert values("Turbines")[-1] == "1"
    page.get_by_text("Remove layout", exact=True).click()
    button("Confirm removal").click()
    ready()
    assert values("Net annual energy") == moved

    # A second site with unavailable providers remains editable and cannot inherit Caithness yield.
    page.route("**/api/analyse", lambda route: route.fulfill(
        status=502, content_type="application/json", body='{"error":{"message":"Provider unavailable"}}'
    ))
    page.get_by_text("Change site", exact=True).click()
    switch = page.locator(".farm-switch")
    switch.get_by_label("Latitude").fill("56")
    switch.get_by_label("Longitude").fill("-4")
    button("Open site").click()
    ready()
    button("+ Turbine").click()
    map_click(0.5, 0.5)
    ready()
    assert values("Turbines") == ["1"] and values("Net annual energy") == ["—"]
    page.get_by_text("Site evidence & modelling assumptions", exact=True).click()
    expect(page.get_by_text("Provider unavailable", exact=True)).to_be_visible()
    page.get_by_text("Change site", exact=True).click()
    page.get_by_role("link", name="Caithness study site").click()
    ready()
    assert values("Net annual energy") == moved
    def covered_parcel(route):
        footprint = json.loads(parse_qs(urlparse(route.request.url).query)["parcel"][0])
        area = [{"lat": lat, "lng": lng} for lng, lat in footprint]
        route.fulfill(json={"at":"2026-01-01T12:00:00Z", "summary":"Test exclusion", "zones":[
            {"reason":"Test exclusion", "polygon":area, "areaSqKm":1}
        ]})

    page.route("**/api/designer/constraints?*", covered_parcel)
    button("Check parcel constraints").click()
    expect(button("Refresh parcel check")).to_be_visible()
    ready()
    assert values("Net annual energy") == ["—", "—", "—"]
    page.reload(wait_until="domcontentloaded")
    expect(button("Refresh parcel check")).to_be_visible()
    ready()
    assert values("Net present value") == ["—", "—", "—"]
    button("Draw parcel").click()
    for x, y in [(0.1, 0.1), (0.9, 0.1), (0.9, 0.9), (0.1, 0.9)]:
        map_click(x, y)
    button("Finish boundary").click()
    expect(button("Check parcel constraints")).to_be_visible()
    ready()
    assert values("Net annual energy") == moved
    assert not errors, errors


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("base")
    parser.add_argument("--chromium", help="Use an existing Chromium executable")
    args = parser.parse_args()
    with sync_playwright() as pw:
        browser = pw.chromium.launch(executable_path=args.chromium)
        page = browser.new_page(viewport={"width": 1440, "height": 1000}, locale="en-GB")
        exercise(page, args.base.rstrip("/"))
        page.close()
        mobile = browser.new_page(viewport={"width": 390, "height": 844}, is_mobile=True, has_touch=True)
        mobile.goto(args.base.rstrip("/") + "/designer")
        expect(mobile.locator(".farm-map.leaflet-container")).to_be_visible()
        mobile.get_by_role("button", name="+ New layout", exact=True).tap()
        mobile.locator(".farm-map").tap(position={"x":160,"y":150})
        expect(mobile.get_by_role("row",name=re.compile("^Turbines")).locator("td").last).to_have_text("1")
        assert mobile.evaluate("document.documentElement.scrollWidth") == 390
        browser.close()
    print("Designer workflow passed on desktop and mobile.")


if __name__ == "__main__":
    main()
