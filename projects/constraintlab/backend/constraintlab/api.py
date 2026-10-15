"""Loopback-only asynchronous jobs; bounded queue and retained results."""

from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from threading import Event, Lock
import json
import uuid
from fastapi import FastAPI, HTTPException
from fastapi.responses import Response
from fastapi.staticfiles import StaticFiles
from .model import parse, verify
from .solver import Config, solve
from .problems import builtin
from .benchmarks import experiment, to_csv

app = FastAPI(title="ConstraintLab", version="0.1.0")
pool = ThreadPoolExecutor(max_workers=1)
jobs = {}
lock = Lock()


@app.middleware("http")
async def local_request(request, call_next):
    host = request.headers.get("host", "").split(":")[0]
    if host not in ("127.0.0.1", "localhost", "testserver"):
        return Response("Loopback host required", 400)
    origin = request.headers.get("origin")
    if origin and origin not in (
        "http://127.0.0.1:8765",
        "http://localhost:8765",
        "http://127.0.0.1:5173",
        "http://localhost:5173",
    ):
        return Response("Origin rejected", 403)
    if request.method == "POST":
        chunks = []
        size = 0
        async for chunk in request.stream():
            size += len(chunk)
            if size > 1_000_000:
                return Response("Input exceeds 1 MB", 413)
            chunks.append(chunk)
        request._body = b"".join(chunks)
    return await call_next(request)


@app.get("/api/health")
def health():
    return {"version": "0.1.0"}


@app.post("/api/builtin")
def make_problem(data: dict):
    try:
        return builtin(**data).json()
    except (ValueError, TypeError) as e:
        raise HTTPException(422, str(e))


@app.post("/api/validate")
def validate(data: dict):
    try:
        p = parse(data["problem"])
        return {
            "valid": True,
            "solution_valid": verify(p, data["assignment"])
            if "assignment" in data
            else None,
        }
    except (ValueError, TypeError, KeyError) as e:
        raise HTTPException(422, str(e))


@app.post("/api/jobs")
def start(data: dict):
    try:
        mode = data.get("mode", "solve")
        if mode not in ("solve", "experiment"):
            raise ValueError("Invalid job mode")
        if mode == "solve":
            problem = parse(data["problem"])
            config = Config(**data.get("config", {}))
            config.validate()
        else:
            problems = data["problems"]
            configs = data["configs"]
            repeats = data.get("repeats", 3)
            seed = data.get("seed", 0)
            if (
                not isinstance(problems, list)
                or not isinstance(configs, list)
                or not 1 <= len(problems) <= 8
                or not 1 <= len(configs) <= 12
                or type(repeats) != int
                or not 1 <= repeats <= 10
            ):
                raise ValueError("Invalid experiment dimensions")
            for p in problems:
                parse(p)
            for c in configs:
                Config(**c).validate()
            if type(seed) != int or not 0 <= seed <= 2**32 - 11:
                raise ValueError("Invalid seed")
    except (ValueError, KeyError, TypeError) as e:
        raise HTTPException(422, str(e))
    with lock:
        if any(j["state"] in ("queued", "running") for j in jobs.values()):
            raise HTTPException(429, "A job is already active; cancel or wait")
        while len(jobs) >= 8:
            jobs.pop(next(iter(jobs)))
        key = uuid.uuid4().hex
        stop = Event()
        jobs[key] = {"state": "queued", "stop": stop, "result": None, "mode": mode}

    def run():
        jobs[key]["state"] = "running"
        try:
            result = (
                solve(problem, config, stop.is_set)
                if mode == "solve"
                else experiment(problems, configs, repeats, seed, stop.is_set)
            )
            jobs[key]["result"] = result
        except Exception:
            jobs[key]["result"] = {
                "status": "ERROR",
                "reason": "Unexpected worker error",
            }
        finally:
            jobs[key]["state"] = "done"

    pool.submit(run)
    return {"id": key}


def job(key):
    if key not in jobs:
        raise HTTPException(404, "Job expired or unknown")
    return jobs[key]


@app.get("/api/jobs/{key}")
def get_job(key: str):
    j = job(key)
    return {k: v for k, v in j.items() if k != "stop"}


@app.post("/api/jobs/{key}/cancel")
def cancel(key: str):
    job(key)["stop"].set()
    return {"requested": True}


@app.get("/api/jobs/{key}/export")
def export(key: str, format: str = "json"):
    j = job(key)
    if j["state"] != "done":
        raise HTTPException(409, "Job still active")
    if format == "csv" and j["mode"] == "experiment":
        return Response(to_csv(j["result"]), media_type="text/csv")
    if format != "json":
        raise HTTPException(422, "CSV is available for experiments")
    return Response(json.dumps(j["result"]), media_type="application/json")


static = Path(__file__).resolve().parents[2] / "frontend" / "dist"
if static.is_dir():
    app.mount("/", StaticFiles(directory=static, html=True), name="frontend")
