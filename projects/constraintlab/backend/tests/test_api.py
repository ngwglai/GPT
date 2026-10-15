import time
import unittest
from fastapi.testclient import TestClient
from constraintlab.api import app
from constraintlab.problems import builtin
from constraintlab.benchmarks import experiment


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
        self.assertEqual(len(self.wait(key)["rows"]), 4)
        csv = self.client.get("/api/jobs/" + key + "/export?format=csv").text
        self.assertIn("environment", csv)
        self.assertIn("problem_id", csv)

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
