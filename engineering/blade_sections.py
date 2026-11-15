"""Extract reference blade geometry on its native grids without interpolation."""
import hashlib
import json
import math
from pathlib import Path


def points(xs, ys):
    # Some reference files use exponent literals which PyYAML reads as strings.
    pairs = [(float(x), float(y)) for x, y in zip(xs, ys, strict=True)]
    if len(pairs) < 2 or not all(math.isfinite(v) for pair in pairs for v in pair):
        raise ValueError("Incomplete or non-finite blade coordinates")
    return pairs


def extract(doc, source_id, revision, source_line, directory):
    shape = doc["components"]["blade"]["outer_shape"]
    stations = []
    sections = {}
    definitions = {a["name"]: a for a in doc["airfoils"]}
    for section in shape["airfoils"]:
        name, span = section["name"], section["spanwise_position"]
        if section["configuration"] != ["default"] or section["weight"] != [1.0]:
            raise ValueError("Unresolved blended/configurable reference airfoil")
        if not 0 <= span <= 1 or (stations and span <= stations[-1]["span"]):
            raise ValueError("Invalid reference section order")
        stations.append({"name": name, "span": span})
        if name not in sections:
            coords = definitions[name]["coordinates"]
            sections[name] = points(coords["x"], coords["y"])
    distributions = {}
    for key in ("chord", "twist", "rthick"):
        data = shape[key]
        pairs = points(data["grid"], data["values"])
        if any(x < 0 or x > 1 for x, _ in pairs) or any(b[0] <= a[0] for a, b in zip(pairs, pairs[1:])):
            raise ValueError("Invalid span grid for " + key)
        distributions[key] = pairs
    payload = dict(source=source_id, revision=revision, line=source_line,
                   stations=stations, profiles=sections, distributions=distributions)
    raw = (json.dumps(payload, allow_nan=False, separators=(",", ":")) + "\n").encode()
    digest = hashlib.sha256(raw).hexdigest()
    directory = Path(directory)
    directory.mkdir(exist_ok=True)
    (directory / (digest + ".json")).write_bytes(raw)
    return digest
