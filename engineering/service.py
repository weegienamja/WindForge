"""Outbound-only service. Exposes a finite collection of parameterised operations."""

import asyncio, hashlib, hmac, json, logging, os, re, shutil, uuid
import websockets
from db import transaction, one, Json, Encoder

enc = Encoder()


def execute(req):
    op = req["op"]
    args = req.get("args", {})
    owner = req.get("owner", "")

    def query(c):
        c.execute("SET LOCAL statement_timeout='4s'")
        rel = one(c, "SELECT release FROM active")
        assert rel
        if op == "catalogue":
            c.execute(
                "SELECT t.record || jsonb_build_object('nodes',(SELECT jsonb_agg(record ORDER BY id) FROM component WHERE release=t.release AND model=t.id)) FROM turbine t WHERE release=%s ORDER BY (record->>'ratedKw')::float",
                (rel,),
            )
            return dict(
                release=rel,
                models=[r[0] for r in c.fetchall()],
                sources=one(
                    c,
                    "SELECT jsonb_object_agg(id,record) FROM source WHERE release=%s",
                    (rel,),
                ),
            )
        if op == "status":
            return dict(
                release=rel,
                passages=one(
                    c, "SELECT count(*) FROM evidence WHERE release=%s", (rel,)
                ),
                embedding="MiniLM-L6-v2 / 384",
                lastIngestion=one(
                    c, "SELECT status FROM ingestion ORDER BY id DESC LIMIT 1"
                ),
            )
        if op == "search":
            q = args["q"]
            scope = args["scope"]
            assert (
                isinstance(q, str)
                and 2 <= len(q) <= 500
                and scope in ("iea34", "iea15", "iea22", "grc", "method", "schema")
            )
            vec = enc.vector(q)
            c.execute(
                """WITH ranked AS (SELECT e.*,1-(embedding <=> %s::vector) AS sim,ts_rank_cd(to_tsvector('english',body),plainto_tsquery('english',%s)) AS lex FROM evidence e WHERE release=%s AND scope=%s) SELECT ranked.id, locator,body,s.record,sim,lex FROM ranked JOIN source s ON s.release=ranked.release AND s.id=ranked.source WHERE sim>0.30 OR lex>0 ORDER BY sim+least(lex,1) DESC LIMIT 4""",
                (vec, q, rel, scope),
            )
            return [
                dict(
                    id=i,
                    locator=l,
                    text=b,
                    source=s,
                    similarity=round(v, 3),
                    keyword=k > 0,
                )
                for i, l, b, s, v, k in c.fetchall()
            ]
        if op == "relatedFact":
            q = args["q"]
            assert isinstance(q, str) and 2 <= len(q) <= 500
            c.execute(
                """SELECT f.field,f.value,f.unit,f.locator,f.line,s.record,1-(f.embedding <=> %s::vector) AS similarity FROM specification f JOIN component n ON (f.release,f.model,f.component)=(n.release,n.model,n.id) JOIN source s ON s.release=n.release AND s.id=n.record->>'source' WHERE f.release=%s AND f.model=%s AND f.component=%s ORDER BY similarity DESC LIMIT 1""",
                (enc.vector(q), rel, args["model"], args["component"]),
            )
            r = c.fetchone()
            return (
                dict(
                    field=r[0],
                    value=r[1],
                    unit=r[2],
                    locator=r[3],
                    line=r[4],
                    source=r[5],
                )
                if r and r[6] >= 0.55
                else None
            )
        if op == "quota":
            key = req["key"]
            cap = args["cap"]
            assert re.fullmatch("[a-f0-9]{64}", key) and cap in (10, 50, 240)
            c.execute("DELETE FROM quota WHERE expires<now()")
            return (
                one(
                    c,
                    "INSERT INTO quota VALUES(%s,1,now()+interval '1 hour') ON CONFLICT(bucket) DO UPDATE SET hits=quota.hits+1 WHERE quota.hits<%s RETURNING hits",
                    (key, cap),
                )
                is not None
            )
        if not re.fullmatch("[a-f0-9]{64}", owner):
            raise ValueError("Missing workspace")
        c.execute("SELECT set_config('wf.owner',%s,true)", (owner,))
        if op == "list":
            c.execute(
                "SELECT id::text,kind,title,created::text FROM work WHERE owner=%s ORDER BY created DESC LIMIT 100",
                (owner,),
            )
            return [
                dict(id=i, kind=k, title=t, created=d) for i, k, t, d in c.fetchall()
            ]
        if op == "journal":
            c.execute(
                "SELECT content->'answer' FROM work WHERE owner=%s AND kind='record' AND content->>'entryType'='answer' AND content->>'reportId'=%s ORDER BY created LIMIT 100",
                (owner, str(uuid.UUID(args["id"]))),
            )
            return [r[0] for r in c.fetchall()]
        if op == "get":
            return one(
                c,
                "SELECT jsonb_build_object('id',id,'kind',kind,'title',title,'content',content,'created',created) FROM work WHERE owner=%s AND id=%s",
                (owner, str(uuid.UUID(args["id"]))),
            )
        if op == "delete":
            return bool(
                one(
                    c,
                    "DELETE FROM work WHERE owner=%s AND id=%s RETURNING true",
                    (owner, str(uuid.UUID(args["id"]))),
                )
            )
        if op == "save":
            kind = args["kind"]
            title = args["title"]
            content = args["content"]
            assert kind in ("site", "record", "comparison") and 1 <= len(title) <= 140
            if len(json.dumps(content).encode()) > 380000:
                raise ValueError("Result exceeds storage limit")
            c.execute("SELECT pg_advisory_xact_lock(hashtext(%s))", (owner,))
            if one(c, "SELECT count(*) FROM work WHERE owner=%s", (owner,)) >= 100:
                raise ValueError("Workspace is full; remove a saved item")
            if shutil.disk_usage("/").free < 650 * 1024**2:
                raise ValueError("Storage reserve reached")
            i = str(uuid.uuid4())
            c.execute(
                "INSERT INTO work(id,owner,kind,title,content) VALUES(%s,%s,%s,%s,%s)",
                (i, owner, kind, title, Json(content)),
            )
            return i
        raise ValueError("Unknown operation")

    return transaction(query)


async def main():
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(message)s")
    while True:
        try:
            async with websockets.connect(
                os.environ["WF_RELAY"],
                extra_headers={"Authorization": "Bearer " + os.environ["WF_KEY"]},
                max_size=700000,
                open_timeout=15,
                ping_interval=20,
            ) as ws:
                logging.info("Engineering relay connected")
                async for raw in ws:
                    r = json.loads(raw)
                    try:
                        reply = {"data": await asyncio.to_thread(execute, r["request"])}
                    except Exception as e:
                        logging.warning(
                            "Request failed: %s %s",
                            r.get("request", {}).get("op"),
                            type(e).__name__,
                        )
                        reply = {
                            "error": str(e)
                            if isinstance(e, ValueError)
                            else "Knowledge operation unavailable"
                        }
                    await ws.send(json.dumps({"id": r["id"], **reply}, allow_nan=False))
        except Exception as e:
            logging.warning("Relay reconnect: %s", type(e).__name__)
            await asyncio.sleep(3)


if __name__ == "__main__":
    asyncio.run(main())
