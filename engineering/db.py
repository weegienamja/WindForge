import json, os
import numpy as np, onnxruntime as ort, psycopg2
from tokenizers import Tokenizer
from pathlib import Path
from psycopg2.extras import Json


def db():
    return psycopg2.connect(dbname="windforge", connect_timeout=3)


def transaction(fn):
    conn = db()
    try:
        with conn:
            with conn.cursor() as c:
                return fn(c)
    finally:
        conn.close()


def one(c, sql, args=()):
    c.execute(sql, args)
    r = c.fetchone()
    return r[0] if r else None


class Encoder:
    def __init__(self):
        base = Path(os.environ.get("WF_MODEL", "/opt/windforge/model"))
        self.t = Tokenizer.from_file(str(base / "tokenizer.json"))
        self.t.enable_truncation(max_length=256)
        opt = ort.SessionOptions()
        opt.inter_op_num_threads = 1
        opt.intra_op_num_threads = 1
        self.s = ort.InferenceSession(
            str(base / "model_quantized.onnx"), opt, providers=["CPUExecutionProvider"]
        )

    def vector(self, txt):
        t = self.t.encode(txt)
        d = {
            "input_ids": t.ids,
            "attention_mask": t.attention_mask,
            "token_type_ids": t.type_ids,
        }
        out = self.s.run(
            None,
            {
                x.name: np.array([d[x.name]], dtype=np.int64)
                for x in self.s.get_inputs()
            },
        )[0][0].mean(axis=0)
        return json.dumps((out / max(float(np.linalg.norm(out)), 1e-12)).tolist())
