"""Rebuild the engineering release from immutable upstream revisions (requires PyYAML)."""

import hashlib, io, json, math, os, re, urllib.request, zipfile
from pathlib import Path
from xml.etree import ElementTree as ET
import yaml
from blade_sections import extract as extract_blade
from machinery import apply as add_machinery

ROOT = Path(__file__).resolve().parent
CACHE = Path(os.environ.get("WINDFORGE_SOURCE_CACHE", ROOT / ".cache"))
SPECS = [
    (
        "iea34",
        "IEA-3.4-130-RWT",
        "aacff396f46b35f7104d83be095f859684013405",
        "yaml/IEA-3.4-130-RWT.yaml",
        "performance/performance_ccblade.dat",
        "onshore",
    ),
    (
        "iea15",
        "IEA-15-240-RWT",
        "28ae083f6e4d2e2e4ea35ac9100fcab104940484",
        "WT_Ontology/IEA-15-240-RWT.yaml",
        "Documentation/IEA-15-240-RWT_tabular.xlsx",
        "offshore",
    ),
    (
        "iea22",
        "IEA-22-280-RWT",
        "7c3cf5df656774bafc6909a92dae8d12f734b122",
        "windIO/IEA-22-280-RWT.yaml",
        "outputs/01_steady_states/OpenFAST/iea-22-280-rwt-steady-states-of.yaml",
        "offshore",
    ),
]
sources, models, passages = {}, [], []
sha = lambda b: hashlib.sha256(b).hexdigest()


# An immutable revision must never change bytes, including in the local cache.
_previous = ROOT / "catalogue.json"
_locked = (
    {
        v["url"]: v["sha256"]
        for v in json.loads(_previous.read_text(encoding="utf-8"))["sources"].values()
    }
    if _previous.exists()
    else {}
)


def source(repo, rev, file, sid, scope):
    cache = CACHE / rev / file
    if not cache.exists():
        data = urllib.request.urlopen(
            f"https://raw.githubusercontent.com/{repo}/{rev}/{file}", timeout=35
        ).read(20_000_001)
        if len(data) > 20_000_000:
            raise ValueError("Oversized source")
        cache.parent.mkdir(parents=True, exist_ok=True)
        cache.write_bytes(data)
    data = cache.read_bytes()
    base = f"https://github.com/{repo}/blob/{rev}/"
    pinned = _locked.get(base + file)
    if pinned is not None and pinned != sha(data):
        raise ValueError("Checksum conflict at pinned revision: " + repo + "/" + file)
    sources[sid] = dict(
        id=sid,
        title=repo.split("/")[-1] + " · " + file.split("/")[-1],
        url=base + file,
        revision=rev,
        scope=scope,
        sha256=sha(data),
        terms="Apache-2.0",
        license=base + "LICENSE",
    )
    return data


def passage(scope, sid, where, body):
    passages.append(
        dict(
            scope=scope,
            source=sid,
            locator=where,
            text=body,
            id=sha(f"{scope}/{sid}/{where}/{body}".encode())[:24],
        )
    )


def sheet(data, num):
    ns = {"x": "http://schemas.openxmlformats.org/spreadsheetml/2006/main"}
    z = zipfile.ZipFile(io.BytesIO(data))
    strings = [
        "".join(x.itertext()) for x in ET.fromstring(z.read("xl/sharedStrings.xml"))
    ]
    rows = []
    for row in ET.fromstring(z.read(f"xl/worksheets/sheet{num}.xml")).findall(
        ".//x:row", ns
    ):
        rec = {}
        for c in row.findall("x:c", ns):
            v = c.findtext("x:v", "", ns)
            if v:
                rec[re.sub(r"\d", "", c.attrib["r"])] = (
                    strings[int(v)] if c.get("t") == "s" else float(v)
                )
        if rec:
            rows.append(rec)
    return rows


FIELDS = {
    "rated_power": "W",
    "hub_height": "m",
    "rotor_diameter": "m",
    "number_of_blades": "blades",
    "cut_in_wind_speed": "m/s",
    "cut_out_wind_speed": "m/s",
    "lifetime": "years",
    "diameter": "m",
    "length": "m",
    "radius": "m",
    "mass": "kg",
    "gear_ratio": "ratio",
    "efficiency": "fraction",
    "wall_thickness": "m",
    "transition_piece_mass": "kg",
    "rated_rpm": "rpm",
    "rated_rotor_speed": "rpm",
    "rotor_orientation": "",
    "drivetrain": "",
    "turbine_class": "",
    "turbulence_class": "",
    "gear_configuration": "",
    "planet_numbers": "count",
    "material": "",
    "hub_material": "",
    "spinner_material": "",
    "mb1Type": "",
    "mb2Type": "",
}


def facts(obj, path):
    return [
        dict(field=k, value=v, unit=FIELDS[k], path=path + "." + k)
        for k, v in obj.items()
        if k in FIELDS
        and not isinstance(v, dict)
        and (not isinstance(v, list) or len(v) <= 5)
    ]


def license_file(repo, rev, sid, scope):
    data = source(repo, rev, "LICENSE", sid + "-license", scope)
    if b"Apache License" not in data:
        raise ValueError("Review upstream license")
    (ROOT / "licenses").mkdir(exist_ok=True)
    (ROOT / "licenses" / (sid + ".txt")).write_bytes(data)


def build():
    for mid, name, rev, yp, curvefile, site in SPECS:
        repo = "IEAWindSystems/" + name
        sid = mid + "-definition"
        cs = mid + "-performance"
        license_file(repo, rev, mid, mid)
        doc = yaml.safe_load(source(repo, rev, yp, sid, mid))
        data = source(repo, rev, curvefile, cs, mid)
        a = doc["assembly"]
        nodes = []

        def node(key, parent, label, obj, path):
            nodes.append(
                dict(
                    id=key,
                    parent=parent,
                    label=label,
                    facts=facts(obj, path),
                    path=path,
                    source=sid,
                )
            )

        node("assembly", None, "Turbine assembly", a, "assembly")
        for k, v in doc["components"].items():
            if not v:
                continue
            node(k, "assembly", k.title(), v, "components." + k)
            if k == "drivetrain":
                for sub, title in {
                    "gearbox": "Gearbox",
                    "generator": "Generator",
                    "lss": "Low-speed shaft",
                    "hss": "High-speed shaft",
                    "bedplate": "Bedplate",
                    "nose": "Nose",
                    "other_components": "Bearing design fields",
                }.items():
                    if v.get(sub) and not (
                        sub == "gearbox" and a["drivetrain"] == "direct_drive"
                    ):
                        node(sub, k, title, v[sub], "components.drivetrain." + sub)
            if k in ("tower", "blade", "monopile"):
                for sub in ("structure", "outer_shape"):
                    struct = v.get(sub, {})
                    node(
                        k + "-" + sub,
                        k,
                        sub.replace("_", " ").title(),
                        {},
                        f"components.{k}.{sub}",
                    )
                    for key, obj in struct.items():
                        path = f"components.{k}.{sub}.{key}"
                        fs = nodes[-1]["facts"]
                        if (
                            key in ("chord", "rthick", "outer_diameter")
                            and isinstance(obj, dict)
                            and "values" in obj
                        ):
                            units = {
                                "chord": "m",
                                "outer_diameter": "m",
                                "rthick": "fraction",
                            }[key]
                            fs.extend(
                                dict(
                                    field=key + " " + n,
                                    value=fn(obj["values"]),
                                    unit=units,
                                    path=path + ".values",
                                )
                                for n, fn in [("minimum", min), ("maximum", max)]
                            )
                        if key in ("webs", "layers") and isinstance(obj, list):
                            fs.append(
                                dict(
                                    field=key, value=len(obj), unit="entries", path=path
                                )
                            )
        node("control", "assembly", "Controller", doc.get("control", {}), "control")
        parsed = yaml.compose(source(repo, rev, yp, sid, mid))

        def line(path):
            obj = parsed
            for key in path.split("."):
                obj = (
                    next((v for k, v in obj.value if k.value == key), None)
                    if isinstance(obj, yaml.MappingNode)
                    else None
                )
                if obj is None:
                    return None
            return obj.start_mark.line + 1

        for n in nodes:
            n["line"] = line(n["path"])
            for f in n["facts"]:
                f["line"] = line(f["path"])
        cutin = a.get("cut_in_wind_speed")
        cutout = a.get("cut_out_wind_speed")
        if mid == "iea34":
            lines = data.decode().splitlines()
            assert "Rotor electrical power (W)" in lines[0]
            rows = [list(map(float, x.split())) for x in lines[1:] if x.strip()]
            curve = [[r[0], r[3] / 1000, r[10]] for r in rows]
            where = "CCBlade columns 1, 4 (electrical W), 11 (Ct)"
        elif mid == "iea15":
            rows = sheet(data, 18)
            assert (rows[0]["A"], rows[0]["C"], rows[0]["I"]) == (
                "Wind [m/s]",
                "Power [MW]",
                "Thrust Coefficient [-]",
            )
            curve = [
                [r["A"], r["C"] * 1000, r["I"]]
                for r in rows[1:]
                if isinstance(r.get("A"), (int, float))
            ]
            overview = {r["A"]: r["B"] for r in sheet(data, 1) if "A" in r and "B" in r}
            cutin = overview["Cut-in wind speed [m/s]"]
            cutout = overview["Cut-out wind speed [m/s]"]
            if abs(a["rated_power"] / 1e6 - overview["Power rating [MW]"]) > 0.001:
                raise ValueError("Conflicting rated power")
            where = "Rotor Performance!A,C,I; Overview!B9:B11"
        else:
            rows = yaml.safe_load(data)["cases"]
            curve = [
                [
                    r["configuration"]["wind_speed"],
                    r["outputs"]["integrated"]["electrical_power"] / 1000,
                    None,
                ]
                for r in rows
            ]
            where = "OpenFAST cases[].configuration.wind_speed and outputs.integrated.electrical_power (W)"
            original = cs
            cs = mid + "-wisdem"
            wb = source(repo, rev, "Documentation/IEA-22-280-RWT_tabular.xlsx", cs, mid)
            rows = sheet(wb, 24)
            assert (
                rows[0]["C"] == "Power [MW]"
                and rows[0]["I"] == "Thrust Coefficient [-]"
            )
            passage(
                mid,
                original,
                where,
                f"The OpenFAST steady-state cases cover {curve[0][0]} to {curve[-1][0]} m/s. WindForge uses the separate WISDEM curve for AEP; it does not extrapolate the missing interval.",
            )
            curve = [
                [r["A"], r["C"] * 1000, r["I"]]
                for r in rows[1:]
                if isinstance(r.get("A"), (int, float))
            ]
            where = (
                "Rotor Performance - WISDEM!A,C,I; separate from OpenFAST steady states"
            )
        if not all(
            math.isfinite(w) and math.isfinite(p) and p >= 0 for w, p, _ in curve
        ) or not all(y[0] > x[0] for x, y in zip(curve, curve[1:])):
            raise ValueError("Invalid curve")
        complete = abs(curve[0][0] - cutin) < 1e-6 and abs(curve[-1][0] - cutout) < 1e-6
        models.append(
            dict(
                id=mid,
                name=name,
                kind="Reference design",
                setting=site,
                revision=rev,
                schema=str(doc["windIO_version"]),
                definition=sid,
                bladeAsset=extract_blade(doc, sid, rev, line("components.blade.outer_shape"), ROOT / "geometry"),
                performance=cs,
                curveLocator=where,
                ratedKw=a["rated_power"] / 1000,
                rotorM=a["rotor_diameter"],
                hubM=a["hub_height"],
                drive=a["drivetrain"],
                cutIn=cutin,
                cutOut=cutout,
                curve=curve,
                fullCurve=complete,
                nodes=nodes,
            )
        )
        read = source(repo, rev, "README.md", mid + "-readme", mid).decode()
        for i, p in enumerate(read.split("\n\n")):
            if 48 < len(p) < 1500 and not any(
                x in p for x in ("![", "<img", "[!", "<div", "<p")
            ):
                passage(mid, mid + "-readme", f"README paragraph {i + 1}", p.strip())
    for repo, rev, file, sid, scope in [
        (
            "IEAWindSystems/windIO",
            "63dcad638a9ac41d24f7a68172e24bde378c23e6",
            "README.rst",
            "windio",
            "schema",
        ),
        (
            "OpenFAST/openfast",
            "2895884d2be01862173c88d70f86b358d2f1a50a",
            "docs/source/user/beamdyn/theory.rst",
            "beamdyn",
            "method",
        ),
    ]:
        license_file(repo, rev, sid, scope)
        blob = source(repo, rev, file, sid, scope).decode()
        for m in re.finditer(r"(?m)(?:^[A-Z][^\n]+(?:\n(?!\s*\n)[^\n]+)*)", blob):
            body = m.group().strip()
            if 80 < len(body) < 1150 and not any(
                x in body
                for x in ["<img", "![", ".. math", "\\begin", "|", "data:image"]
            ):
                passage(
                    scope, sid, "line " + str(blob[: m.start()].count("\n") + 1), body
                )
    schema = yaml.safe_load(
        source(
            "IEAWindSystems/windIO",
            "63dcad638a9ac41d24f7a68172e24bde378c23e6",
            "windIO/schemas/turbine/turbine_schema.yaml",
            "windio-schema",
            "schema",
        )
    )
    for model in models:
        for n in model["nodes"]:
            obj = schema
            for key in n["path"].split("."):
                obj = obj.get("properties", {}).get(key, {})
            n["description"] = obj.get("description", "")
            if n["description"] and not any(
                p["locator"] == n["path"] and p["scope"] == "schema" for p in passages
            ):
                passage("schema", "windio-schema", n["path"], n["description"][:1400])
    for sid, title, url, where, body in [
        (
            "grc-benchmark",
            "Wind turbine gearbox condition monitoring vibration analysis benchmarking datasets - Shawn Sheng (2014)",
            "https://data.openei.org/submissions/738",
            "DOI 10.25984/1844194 - dataset description",
            "Accelerometers and high-speed shaft RPM were recorded under controlled dynamometer loads. The benchmark distinguishes healthy and damaged research gearboxes of the same design. Compare records at matched shaft speed and load before attributing vibration changes to an internal fault.",
        ),
        (
            "grc-round",
            "Gearbox condition monitoring round robin – vibration analysis",
            "https://wdh.energy.gov/publication/447",
            "Abstract",
            "GRC researchers compared two gearboxes. The field test gearbox experienced oil loss; subsequent inspection found damage in bearings and gears. The study used vibration data from dynamometer testing.",
        ),
        (
            "grc-cracks",
            "Gearbox instrumentation for the investigation of bearing axial cracking",
            "https://research-hub.nlr.gov/en/publications/gearbox-instrumentation-for-the-investigation-of-bearing-axial-cr/",
            "Abstract · NREL/TP-5000-70639",
            "This investigation instrumented a gearbox to study bearing axial cracking. It concerns the research drivetrain and does not establish the condition of another gearbox.",
        ),
    ]:
        sources[sid] = dict(
            id=sid,
            title=title,
            url=url,
            revision=where,
            scope="grc",
            sha256=sha(body.encode()),
            terms="WindForge factual annotation; link only to upstream work",
            license=url,
        )
        passage("grc", sid, where, body)
    mechanics = {
        "blade": "Aerodynamic forces on the blade turn the rotor.",
        "gearbox": "Gears increase rotational speed between the rotor and the generator.",
        "generator": "The generator converts rotational mechanical power into electricity.",
        "drivetrain": "The drivetrain transmits rotor rotation to the generator. The speed conversion depends on whether the design is geared or direct-drive.",
        "assembly": "The rotor captures mechanical power from the wind and drives a generator.",
    }
    ref = "https://www.energy.gov/cmei/systems/how-do-wind-turbines-work"
    sources["doe-functions"] = dict(
        id="doe-functions",
        title="U.S. Department of Energy · How do wind turbines work?",
        url=ref,
        revision="Reviewed 2026-11-15",
        scope="method",
        sha256=sha(json.dumps(mechanics, sort_keys=True).encode()),
        terms="WindForge factual annotations; no third-party images or text redistributed",
        license=ref,
    )
    for m in models:
        for n in m["nodes"]:
            if n["id"] in mechanics:
                n["function"] = mechanics[n["id"]]
    for k, v in mechanics.items():
        passage("method", "doe-functions", "How turbines work · " + k, v)
    add_machinery(models, sources, passage)
    payload = dict(version=1, models=models, sources=sources, passages=passages)
    assert len({p["id"] for p in passages}) == len(passages)
    payload["release"] = sha(json.dumps(payload, sort_keys=True).encode())[:16]
    tmp = ROOT / "catalogue.tmp"
    tmp.write_text(
        json.dumps(payload, ensure_ascii=False, indent=2, allow_nan=False) + "\n",
        encoding="utf-8",
    )
    tmp.replace(ROOT / "catalogue.json")
    print(
        payload["release"],
        len(models),
        "models",
        sum(len(m["nodes"]) for m in models),
        "nodes",
        len(passages),
        "passages",
    )


if __name__ == "__main__":
    build()
