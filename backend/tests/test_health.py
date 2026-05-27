from app import create_app


def test_health_endpoint():
    app = create_app("testing")
    client = app.test_client()
    resp = client.get("/api/v1/health")
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["success"] is True
    assert body["data"]["status"] == "healthy"


def test_root_endpoint():
    app = create_app("testing")
    client = app.test_client()
    resp = client.get("/")
    assert resp.status_code == 200
    assert resp.get_json()["status"] == "ok"
