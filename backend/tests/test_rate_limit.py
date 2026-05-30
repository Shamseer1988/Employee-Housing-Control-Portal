"""Phase 2 — rate limit + security headers smoke tests."""
import os
import pytest

from app import create_app
from app.extensions import db, limiter
from app.cli import _seed_permissions, _seed_roles, _seed_super_user
from app.services import settings as settings_service
from config import TestingConfig


@pytest.fixture()
def rl_app(tmp_path):
    """Fresh app with rate-limiting ENABLED. The default `app` fixture
    keeps limiting OFF so unrelated tests don't trip the bucket; this
    fixture flips the class attribute before create_app so that
    Limiter.init_app() sees it enabled and wires storage. Restored on
    teardown so the rest of the suite is unaffected."""
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    os.environ["UPLOAD_FOLDER"] = str(upload_dir)

    original_enabled = TestingConfig.RATELIMIT_ENABLED
    TestingConfig.RATELIMIT_ENABLED = True
    try:
        app = create_app("testing")
        app.config["UPLOAD_FOLDER"] = str(upload_dir)
        try:
            limiter.reset()
        except Exception:
            pass
        with app.app_context():
            db.create_all()
            perm_index = _seed_permissions()
            role_index = _seed_roles(perm_index)
            _seed_super_user(role_index)
            settings_service.seed_defaults()
            db.session.commit()
            yield app
            db.session.remove()
            db.drop_all()
    finally:
        TestingConfig.RATELIMIT_ENABLED = original_enabled
        try:
            limiter.reset()
        except Exception:
            pass
        # Restore the flag on the live extension so the next test (which
        # may not rebuild) sees the original setting.
        limiter.enabled = original_enabled


def test_login_rate_limit_kicks_in_at_11th_hit(rl_app):
    c = rl_app.test_client(use_cookies=True)
    # 10/min — first 10 bad attempts should be 401, the 11th should be 429.
    statuses = []
    for _ in range(11):
        r = c.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
        statuses.append(r.status_code)
    assert statuses[:10] == [401] * 10, statuses
    assert statuses[10] == 429, statuses

    final = c.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    body = final.get_json()
    assert body["success"] is False
    assert "Too many requests" in body["message"]


def test_security_headers_present_on_normal_response(client):
    # `client` comes from the shared conftest (RATELIMIT_ENABLED=False).
    r = client.get("/api/v1/health")
    assert r.status_code == 200
    h = r.headers
    assert "max-age=" in h.get("Strict-Transport-Security", "")
    assert h.get("X-Content-Type-Options") == "nosniff"
    assert h.get("X-Frame-Options") == "DENY"
    assert h.get("Referrer-Policy") == "strict-origin-when-cross-origin"
    assert "camera=()" in h.get("Permissions-Policy", "")
