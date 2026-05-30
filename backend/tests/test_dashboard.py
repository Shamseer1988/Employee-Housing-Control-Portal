from datetime import date, timedelta


def _scaffold(client, auth_headers):
    prop = client.post("/api/v1/properties", headers=auth_headers,
                       json={"name": "P", "property_type": "full_building"}).get_json()["data"]
    floor = client.post(f"/api/v1/properties/{prop['id']}/floors", headers=auth_headers,
                        json={"floor_number": "1"}).get_json()["data"]
    room = client.post(f"/api/v1/floors/{floor['id']}/rooms", headers=auth_headers,
                       json={"room_number": "101", "capacity": 2}).get_json()["data"]
    b1 = client.post(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
                     json={"bed_number": "1"}).get_json()["data"]
    b2 = client.post(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
                     json={"bed_number": "2"}).get_json()["data"]
    emp = client.post("/api/v1/employees", headers=auth_headers,
                      json={"full_name": "Ahmed", "gender": "male"}).get_json()["data"]
    landlord = client.post("/api/v1/landlords", headers=auth_headers,
                           json={"name": "L"}).get_json()["data"]
    return prop, floor, room, [b1, b2], emp, landlord


def test_summary_endpoint(client, auth_headers):
    prop, _, _, beds, emp, _ = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})

    resp = client.get("/api/v1/dashboard/summary", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["data"]

    assert data["properties"]["total"] >= 1
    assert data["beds"]["total"] == 2
    assert data["beds"]["occupied"] == 1
    assert data["beds"]["empty"] == 1
    assert data["beds"]["occupancy_percent"] == 50.0
    assert data["employees"]["assigned"] == 1
    assert data["rooms"]["partially_occupied"] >= 1
    assert "expiry_buckets" in data["agreements"]
    assert "in_progress" in data["maintenance"]


def test_alerts_endpoint(client, auth_headers):
    prop, _, _, beds, emp, landlord = _scaffold(client, auth_headers)
    today = date.today()

    # An expiring agreement (5 days) — on the property
    client.post(f"/api/v1/properties/{prop['id']}/agreements", headers=auth_headers,
                json={
                    "landlord_id": landlord["id"],
                    "start_date": (today - timedelta(days=200)).isoformat(),
                    "expiry_date": (today + timedelta(days=5)).isoformat(),
                    "monthly_rent": 1000,
                })

    # Unassigned employee that needs accommodation
    client.post("/api/v1/employees", headers=auth_headers,
                json={"full_name": "Needs House", "accommodation_required": True})

    # An in-progress maintenance record
    client.post("/api/v1/maintenance", headers=auth_headers,
                json={"entity_type": "bed", "entity_id": beds[1]["id"], "reason": "fix"})

    resp = client.get("/api/v1/dashboard/alerts", headers=auth_headers)
    assert resp.status_code == 200
    body = resp.get_json()["data"]
    assert len(body["critical"]["expiring_within_7_days"]) >= 1
    assert any(u["full_name"] == "Needs House"
               for u in body["warning"]["unassigned_employees"])
    assert len(body["info"]["maintenance_in_progress"]) >= 1
    assert body["counts"]["critical"] >= 1
    assert body["counts"]["warning"] >= 1
    assert body["counts"]["info"] >= 1


def test_activity_feed(client, auth_headers):
    _, _, _, beds, emp, _ = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    client.post("/api/v1/transfers", headers=auth_headers,
                json={"employee_id": emp["id"], "to_bed_id": beds[1]["id"], "reason": "bed_change"})

    resp = client.get("/api/v1/dashboard/activity?limit=5", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.get_json()["data"]
    types = {r["type"] for r in rows}
    assert "assignment" in types
    assert "transfer" in types


def test_occupancy_by_property_chart(client, auth_headers):
    prop, _, _, beds, emp, _ = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})

    resp = client.get("/api/v1/dashboard/charts/occupancy-by-property", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.get_json()["data"]
    by_id = {r["property_id"]: r for r in rows}
    assert by_id[prop["id"]]["total"] == 2
    assert by_id[prop["id"]]["occupied"] == 1
    assert by_id[prop["id"]]["empty"] == 1
    assert by_id[prop["id"]]["occupancy_percent"] == 50.0


def test_monthly_movement_chart(client, auth_headers):
    _, _, _, beds, emp, _ = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})

    resp = client.get("/api/v1/dashboard/charts/monthly-movement?months=3", headers=auth_headers)
    assert resp.status_code == 200
    rows = resp.get_json()["data"]
    assert len(rows) == 3
    total_assignments = sum(r["assignments"] for r in rows)
    assert total_assignments >= 1


def test_dashboard_requires_permission(client):
    resp = client.get("/api/v1/dashboard/summary")
    assert resp.status_code == 401
