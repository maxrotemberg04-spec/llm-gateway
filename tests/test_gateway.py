"""API tests for the gateway: routing, rate limit, kill-switch, dashboard."""
import pathlib
import sys
import unittest

sys.path.insert(0, str(pathlib.Path(__file__).resolve().parent.parent))

from fastapi.testclient import TestClient
from app.main import app


class TestGateway(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.ctx = TestClient(app)
        cls.client = cls.ctx.__enter__()      # trigger lifespan (seeds demo data)

    @classmethod
    def tearDownClass(cls):
        cls.ctx.__exit__(None, None, None)

    def test_health_reports_mode(self):
        body = self.client.get("/health").json()
        self.assertTrue(body["ok"])
        self.assertIn(body["mode"], ("mock", "live"))

    def test_chat_routes_and_prices(self):
        r = self.client.post("/chat", json={
            "prompt": "tempo run", "user_id": "t_route", "tier": "cheap", "plan": "pro",
        }).json()
        self.assertEqual(r["status"], "ok")
        self.assertIn("haiku", r["model"])
        self.assertGreater(r["cost_usd"], 0)
        self.assertGreaterEqual(r["latency_ms"], 0)

    def test_free_plan_rate_limit_trips_at_six(self):
        statuses = [
            self.client.post("/chat", json={
                "prompt": "hi", "user_id": "t_free", "plan": "free",
            }).json()["status"]
            for _ in range(6)
        ]
        self.assertEqual(statuses[:5], ["ok"] * 5)      # free = 5 per window
        self.assertEqual(statuses[5], "rate_limited")

    def test_killswitch_blocks_then_recovers(self):
        self.client.post("/killswitch", json={"cap_usd": 0.0000001})
        r = self.client.post("/chat", json={"prompt": "hi", "user_id": "t_ks", "plan": "pro"}).json()
        self.assertEqual(r["status"], "blocked")
        self.client.post("/killswitch", json={"cap_usd": 50.0})
        r2 = self.client.post("/chat", json={"prompt": "hi", "user_id": "t_ks2", "plan": "pro"}).json()
        self.assertEqual(r2["status"], "ok")

    def test_stats_shape(self):
        s = self.client.get("/stats").json()
        for key in ("total_requests", "served", "blocked", "total_cost_usd",
                    "active_users", "p50_ms", "p95_ms", "by_model", "by_user"):
            self.assertIn(key, s)
        self.assertEqual(len(self.client.get("/stats/timeseries").json()), 14)

    def test_dashboard_served(self):
        page = self.client.get("/")
        self.assertEqual(page.status_code, 200)
        self.assertIn("LLM Gateway", page.text)


if __name__ == "__main__":
    unittest.main()
