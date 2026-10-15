import csv
import io
import time
import unittest
from unittest.mock import patch
from fastapi.testclient import TestClient
from constraintlab.api import app, job
from constraintlab.problems import builtin
from constraintlab.benchmarks import experiment, to_csv


class ApiTests(unittest.TestCase):
    def setUp(self):
        self.client = TestClient(app)

    def wait(self, key):
        for _ in range(500):
            j = self.client.get("/api/jobs/" + key).json()
            if j["state"] == "done":
                return j["result"]
            time.sleep(0.01)
        self.fail("Job did not finish")

    def test_lifecycle_and_exports(self):
        p = builtin(size=4).json()
        self.assertEqual(
            self.client.post("/api/validate", json={"problem": p}).status_code, 200
        )
        key = self.client.post("/api/jobs", json={"problem": p}).json()["id"]
        r = self.wait(key)
        self.assertEqual(r["status"], "SAT")
        self.assertTrue(
            self.client.post(
                "/api/validate", json={"problem": p, "assignment": r["solutions"][0]}
            ).json()["solution_valid"]
        )
        key = self.client.post(
            "/api/jobs",
            json={
                "mode": "experiment",
                "problems": [p],
                "configs": [{"algorithm": "BT"}, {"algorithm": "MAC"}],
                "repeats": 2,
            },
        ).json()["id"]
        report = self.wait(key)
        self.assertEqual(len(report["rows"]), 4)
        self.assertEqual(len(report["problems"]), 1)
        self.assertNotIn("problem", report["rows"][0])
        self.assertIn(report["rows"][0]["problem_id"], report["problems"])
        exported_csv = self.client.get("/api/jobs/" + key + "/export?format=csv").text
        records = list(csv.DictReader(io.StringIO(exported_csv)))
        self.assertEqual(len(records), 4)
        self.assertTrue(records[0]["problem"])
        self.assertTrue(all(not row["problem"] for row in records[1:]))
        self.assertIn("environment", exported_csv)
        self.assertIn("problem_id", exported_csv)
        exported_json = self.client.get("/api/jobs/" + key + "/export?format=json").json()
        self.assertEqual(exported_json["problems"], report["problems"])

    def test_atomic_lookup_avoids_check_then_index_race(self):
        class RetainedJobs(dict):
            def __getitem__(self, key):
                # Simulate an entry disappearing between membership and indexing.
                raise KeyError(key)

        with patch("constraintlab.api.jobs", RetainedJobs({"known": {"state": "done"}})):
            self.assertEqual(job("known")["state"], "done")

    def test_cancel(self):
        key = self.client.post(
            "/api/jobs",
            json={
                "problem": builtin(size=32).json(),
                "config": {
                    "algorithm": "BT",
                    "max_solutions": 10000,
                    "timeout": 120,
                    "trace_limit": 0,
                },
            },
        ).json()["id"]
        self.assertEqual(
            self.client.post("/api/jobs/" + key + "/cancel").status_code, 200
        )
        r = self.wait(key)
        self.assertEqual(r["reason"], "cancelled")
        self.assertFalse(r["complete"])

    def test_invalid_and_host(self):
        self.assertEqual(
            self.client.post("/api/jobs", json={"problem": {}}).status_code, 422
        )
        self.assertEqual(
            self.client.post(
                "/api/builtin", json={"kind": "graph", "edges": [["bad", "1"]]}
            ).status_code,
            422,
        )
        self.assertEqual(
            self.client.get(
                "/api/health", headers={"host": "evil.example"}
            ).status_code,
            400,
        )
        self.assertEqual(
            self.client.post(
                "/api/validate", json={}, headers={"origin": "https://evil.example"}
            ).status_code,
            403,
        )
        self.assertEqual(
            self.client.post("/api/validate", content="x" * 1000001).status_code, 413
        )
        self.assertEqual(
            self.client.post(
                "/api/jobs", content="{", headers={"content-type": "application/json"}
            ).status_code,
            422,
        )

    def test_reproducibility(self):
        p = builtin(size=4).json()
        cfg = [{"value": "random", "max_solutions": 10}]
        a = experiment([p], cfg, 2, 17)
        b = experiment([p], cfg, 2, 17)
        for x, y in zip(a["rows"], b["rows"]):
            x["stats"].pop("seconds")
            y["stats"].pop("seconds")
            self.assertEqual(x, y)
