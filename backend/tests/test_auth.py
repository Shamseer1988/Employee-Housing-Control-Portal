def test_login_success(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert "access_token" in data
    assert "refresh_token" in data
    assert data["user"]["is_super_user"] is True


def test_login_bad_password(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "wrong"})
    assert resp.status_code == 401


def test_me_requires_auth(client):
    resp = client.get("/api/v1/auth/me")
    assert resp.status_code == 401


def test_me_with_token(client, auth_headers):
    resp = client.get("/api/v1/auth/me", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert body["username"] == "admin"
    assert "*" in body["permissions"] or len(body["permissions"]) > 10


def test_users_list_requires_permission(client):
    resp = client.get("/api/v1/users")
    assert resp.status_code == 401


def test_users_list(client, auth_headers):
    resp = client.get("/api/v1/users", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.get_json()["meta"]["count"] >= 1


def test_create_and_login_regular_user(client, auth_headers):
    # Find the HR Executive role
    roles = client.get("/api/v1/roles", headers=auth_headers).get_json()["data"]
    hr = next(r for r in roles if r["code"] == "hr_executive")

    resp = client.post(
        "/api/v1/users",
        headers=auth_headers,
        json={
            "username": "hr1",
            "email": "hr1@pugroup.local",
            "full_name": "HR One",
            "password": "Password123",
            "role_ids": [hr["id"]],
        },
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)

    # New user logs in
    login = client.post("/api/v1/auth/login", json={"username": "hr1", "password": "Password123"})
    assert login.status_code == 200
    token = login.get_json()["data"]["access_token"]
    headers = {"Authorization": f"Bearer {token}"}

    # HR Executive has employee.view but NOT user.manage
    me = client.get("/api/v1/auth/me", headers=headers).get_json()["data"]
    assert "employee.view" in me["permissions"]
    assert "user.manage" not in me["permissions"]

    forbidden = client.post(
        "/api/v1/users", headers=headers,
        json={"username": "x", "email": "x@x.com", "full_name": "X", "password": "Password123"},
    )
    assert forbidden.status_code == 403


def test_role_permission_catalog(client, auth_headers):
    resp = client.get("/api/v1/roles/permissions/catalog", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert "modules" in data
    assert data["count"] > 0


def test_audit_log_records_login(client, auth_headers):
    resp = client.get("/api/v1/audit?action=login", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.get_json()["data"]
    assert any(r["action"] == "login" for r in rows)
