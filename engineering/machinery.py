"""Reviewed machinery notes. Only explicit reference fields become design specifications."""
import hashlib
import json


PUBLICATIONS = {
    "doe-nacelle": ("DOE · Explore a Wind Turbine", "https://www.energy.gov/cmei/systems/explore-wind-turbine-text-version", "Nacelle, main shaft bearing and direct-drive sections"),
    "yaw-field": ("Simley et al. · Wake-steering field experiment", "https://wes.copernicus.org/articles/6/1427/2021/", "2021 · §2.1 and wind-vane comparison"),
    "planetary-test": ("Input torque measurements for wind turbine gearboxes", "https://wes.copernicus.org/articles/7/505/2022/", "2022 · §2, Fig. 2"),
    "gear-inspection": ("Keller et al. · Condition of a GE Transportation Systems gearbox", "https://doi.org/10.2172/1659805", "2020 · NREL/TP-5000-76004, abstract"),
    "main-bearing-field": ("Hart et al. · Main bearing replacement and damage", "https://doi.org/10.2172/1992019", "2023 · damage observations, Fig. 7"),
    "skf-carb": ("SKF · CARB toroidal roller bearings", "https://cdn.skfmediahub.skf.com/api/public/094bdeafb6b4ce5c/pdf_preview_medium/094bdeafb6b4ce5c_pdf_preview_medium.pdf", "Bearing features, p. 4"),
    "skf-srb": ("SKF · Spherical roller bearings", "https://www.skf.com/binaries/pub12/Images/0901d196808a4ad1-Spherical-roller-bearings_18406-EN_tcm_12-480491.pdf", "Bearing design, Fig. 1"),
    "eia-induction": ("EIA · How electricity is generated", "https://www.eia.gov/energyexplained/electricity/how-electricity-is-generated.php", "Electromagnetic generators"),
    "offshore-roadmap": ("NREL and Sandia · Offshore wind operations and maintenance roadmap", "https://www.energy.gov/sites/default/files/2024-05/operations-and-maintenance-roadmap-for-us-offshore-wind.5.17.24.pdf", "2024 · §3.2.1, Hub and Nacelle"),
    "generator-thermal": ("Applying thermophysics for wind turbine drivetrain fault diagnosis", "https://doi.org/10.1049/iet-rpg.2015.0160", "2016 · §4.2, generator case study"),
}


def note(source, text):
    return {"source": source, "text": text}


def case(title, finding, inspect, scope):
    return dict(title=title, finding=finding, inspect=inspect, scope=scope)


yaw = case("Yaw alignment", note("yaw-field", "A biased wind-vane reading can make the reported alignment differ from the incoming wind direction."),
           note("yaw-field", "Compare wind-vane direction with an independent inflow measurement. The field experiment also checked nacelle heading with a GNSS compass."),
           "Commercial wind plant field experiment. A heading discrepancy alone does not identify a failed yaw drive.")
pits = case("Gear tooth micropitting", note("gear-inspection", "Repeated contact can fatigue small areas of a tooth flank. Load, sliding and lubricant conditions influence how micropitting develops."),
            note("gear-inspection", "Compare the position and extent of flank damage in inspection photographs with the operating load, speed, temperature and lubricant history."),
            "Observed in a GE Transportation Systems gearbox. The IEA model supplies design fields only.")
cracks = case("Axial cracking in gearbox bearings", note("grc-cracks", "Cracks can develop along bearing raceways in intermediate- and high-speed stages. The NREL investigation focused on a high-speed shaft bearing."),
              note("grc-cracks", "Identify the bearing and stage. The test rig instrumented shaft loads and sliding and monitored bearing and oil temperatures, water in the lubricant and electrical current."),
              "Instrumentation study on a separate 1.5 MW turbine. Conditions that accompanied cracking do not establish its cause.")
oil = case("Lubricant loss", note("grc-round", "A GRC field gearbox lost oil. A subsequent inspection found damage to bearings and gears."),
           note("grc-benchmark", "Compare accelerometer signals at matched shaft speed and load, keeping the sensor mounting position with the record."),
           "GRC test gearboxes. Localising damage requires inspection evidence as well as vibration records.")
spalling = case("Raceway spalling", note("main-bearing-field", "Flakes of material can detach from a rolling contact surface. Spalling was the most frequently reported damage in this field study."),
                note("main-bearing-field", "Record whether damage lies on the inner ring, outer ring or rollers. Inspection images and the damage location help distinguish observations from potential causes."),
                "Field data dominated by land-based, three-point spherical roller bearings. The authors could not resolve the initiation mechanism in every case.")
cooling = case("Reduced generator cooling", note("generator-thermal", "A ventilation fault in a studied doubly fed generator changed the relationship between stator winding temperature and electrical output."),
               note("generator-thermal", "Compare winding temperatures at similar output against the machine’s earlier healthy trend. Include ambient conditions and the recorded cooling state."),
               "Published 1.5 MW case study. Use its comparison method with the actual machine’s cooling design.")
winding = case("Winding insulation or connection damage", note("offshore-roadmap", "The offshore roadmap identifies insulation damage, contamination and connection faults in permanent-magnet generator windings."),
               note("generator-thermal", "Compare the winding-temperature channels against output and cooling operation. A hot winding can also reflect a ventilation problem."),
               "Generator-class evidence. A temperature trend alone cannot establish an electrical insulation fault.")
magnet = case("Loss of magnetisation", note("offshore-roadmap", "The roadmap lists demagnetisation among the failure modes of permanent-magnet synchronous generators."),
              note("offshore-roadmap", "First identify the generator topology from an asset drawing or nameplate. This mechanism requires a permanent-magnet machine."),
              "Specific to permanent-magnet generators. The diagram illustrates relative motion independently of rotor construction.")


def apply(models, sources, passage):
    annotations = {sid: set() for sid in PUBLICATIONS}
    seen = set()

    def guide(node, how, faults, basis="Reference assembly"):
        node["machinery"] = dict(how=how, cases=faults, basis=basis)
        for entry in [how, *(v for fault in faults for v in (fault["finding"], fault["inspect"]))]:
            sid, body = entry["source"], entry["text"]
            if sid in annotations:
                annotations[sid].add(body)
            if (sid, body) not in seen:
                seen.add((sid, body))
                scope = sources[sid]["scope"] if sid in sources else "method"
                locator = PUBLICATIONS[sid][2] if sid in PUBLICATIONS else sources[sid]["revision"]
                passage(scope, sid, locator, body)

    for model in models:
        nodes = {n["id"]: n for n in model["nodes"]}
        def child(key, parent, label, source, path, line=None, facts=None):
            n = dict(id=key, parent=parent, label=label, source=source, path=path, line=line,
                     facts=facts or [], description="")
            model["nodes"].append(n)
            return n

        nacelle = nodes["drivetrain"]
        nacelle["label"] = "Nacelle and drivetrain"
        geared = "gearbox" in nodes
        power_path = ("The nacelle houses the shaft, gearbox and generator. The main bearings carry rotor loads while the gearbox raises shaft speed."
                      if geared else "The nacelle houses the shaft, main bearings and generator. The turbine rotor drives the generator at rotor speed through a direct mechanical connection.")
        guide(nacelle, note("doe-nacelle", power_path), [yaw])
        main = nodes["other_components"]
        main["label"] = "Main bearings"
        guide(main, note("doe-nacelle", "The main bearings support the low-speed shaft as the rotor turns and transfer rotor loads into the stationary structure."), [spalling])
        for field, name, sid, explanation in [
            ("mb1Type", "Main bearing 1", "skf-carb", "The CARB bearing uses toroidal rollers. It supports radial load and permits axial movement within the bearing as the shaft changes length."),
            ("mb2Type", "Main bearing 2", "skf-srb", "A spherical roller bearing has two rows of rollers sharing a curved outer raceway. It can support radial load and axial load in either direction."),
        ]:
            fact = next(f for f in main["facts"] if f["field"] == field)
            required = "CARB" if field == "mb1Type" else "SRB"
            if fact["value"] != required:
                raise ValueError("Review bearing family before reusing machinery guide")
            bearing = child(field[:3], main["id"], name+" · "+required, model["definition"], fact["path"], fact["line"], [fact])
            guide(bearing, note(sid, explanation), [spalling], "Reference bearing type")
        if geared:
            gearbox = nodes["gearbox"]
            guide(gearbox, note("doe-nacelle", "The gearbox couples the slow main shaft to the faster generator shaft. The speed increase lets the generator operate at lower torque for a given power."), [pits, cracks, oil])
            config = next(f for f in gearbox["facts"] if f["field"] == "gear_configuration")
            stage = child("gear-stages", "gearbox", "Gear stages", model["definition"], config["path"], config["line"], [f for f in gearbox["facts"] if f["field"] in ("gear_configuration","planet_numbers")])
            guide(stage, note("planetary-test", "In a fixed-ring planetary stage, the carrier turns the planet gears around the sun. Contact with the ring and sun transfers torque and increases the output speed."), [pits])
            bearing = child("gearbox-bearings", "gearbox", "Gearbox bearings", "grc-cracks", "NREL/TP-5000-70639 · high-speed shaft bearings")
            guide(bearing, note("grc-cracks", "These bearings support shafts rotating inside the gearbox. NREL’s instrumented example examined how bearing loads and sliding change during operation."), [cracks, oil], "Separate research assembly")
        gen = nodes["generator"]
        guide(gen, note("eia-induction", "The rotating and stationary parts move relative to a magnetic field. The changing magnetic flux through the windings induces voltage."), [cooling, winding])
        rotor = child("generator-rotor", "generator", "Generator rotor", "eia-induction", "Electromagnetic generators · rotor")
        guide(rotor, note("eia-induction", "The generator rotor is the rotating electrical-machine element. Its motion relative to the stator produces a changing magnetic field at the windings."), [magnet], "Operating principle")
        stator = child("generator-stator", "generator", "Stator and windings", "eia-induction", "Electromagnetic generators · stator")
        guide(stator, note("eia-induction", "The stator stays fixed to the frame. In the illustrated arrangement, magnetic flux changes through its insulated coils as the rotor turns."), [winding, cooling], "Operating principle")
    for sid, (title,url,locator) in PUBLICATIONS.items():
        digest = hashlib.sha256(json.dumps(sorted(annotations[sid])).encode()).hexdigest()
        sources[sid] = dict(id=sid, title=title, url=url, revision=locator, sha256=digest,
                            scope="method", terms="WindForge factual annotation; original publication linked", license=url)
