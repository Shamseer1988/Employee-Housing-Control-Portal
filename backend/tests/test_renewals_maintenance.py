from datetime import date, timedelta


def _make_property(client, auth_headers, name="MaintP"):
    return client.post(
        "/api/v1/properties", headers=auth_headers,
        json={"name": name, "property_type": "full_building"},
    ).get_json()["data"]


def _make_landlord(client, auth_headers, name="L"):
    return client.post("/api/v1/landlords", headers=auth_headers, json={"name": name}).get_json()["data"]


def _make_floor_room_bed(client, auth_headers, prop_id):
    f = client.post(f"/api/v1/properties/{prop_id}/floors", headers=auth_headers,
                    json={"floor_number": "1"}).get_json()["data"]
    r = client.post(f"/api/v1/floors/{f['id']}/rooms", headers=auth_headers,
                    json={"room_number": "101", "capacity": 2}).get_json()["data"]
    b1 = client.post(f"/api/v1/rooms/{r['id']}/beds", headers=auth_headers,
                     json={"bed_number": "1"}).get_json()["data"]
    b2 = client.post(f"/api/v1/rooms/{r['id']}/beds", headers=auth_headers,
                     json={"bed_number": "2"}).get_json()["data"]
    return f, r, [b1, b2]


# ---------- Renewals ----------

def test_renewal_archives_previous_and_records_transaction(client, auth_headers):
    prop = _make_property(client, auth_headers)
    ll = _make_landlord(client, auth_headers)
    today = date.today()

    # Initial agreement via the Phase-3 endpoint
    client.post(
        f"/api/v1/properties/{prop['id']}/agreements", headers=auth_headers,
        json={
            "landlord_id": ll["id"],
            "start_date": (today - timedelta(days=200)).isoformat(),
            "expiry_date": (today + timedelta(days=30)).isoformat(),
            "monthly_rent": 10000,
        },
    )

    # Post the renewal
    resp = client.post(
        "/api/v1/renewals", headers=auth_headers,
        json={
            "property_id": prop["id"],
            "landlord_id": ll["id"],
            "new_start_date": (today + timedelta(days=31)).isoformat(),
            "new_expiry_date": (today + timedelta(days=395)).isoformat(),
            "new_monthly_rent": 11000,
        },
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    body = resp.get_json()["data"]
    assert body["transaction_number"].startswith("LRENEW-")
    assert body["old_monthly_rent"] == 10000.0
    assert body["new_monthly_rent"] == 11000.0

    # Previous archived; new active
    agreements = client.get(
        f"/api/v1/properties/{prop['id']}/agreements", headers=auth_headers,
    ).get_json()["data"]
    active = [a for a in agreements if a["is_active"]]
    archived = [a for a in agreements if not a["is_active"]]
    assert len(active) == 1
    assert active[0]["monthly_rent"] == 11000.0
    assert len(archived) == 1
    assert archived[0]["renewal_status"] == "renewed"


def test_renewal_with_no_prior_agreement(client, auth_headers):
    prop = _make_property(client, auth_headers, "Fresh")
    ll = _make_landlord(client, auth_headers, "L2")
    today = date.today()
    resp = client.post(
        "/api/v1/renewals", headers=auth_headers,
        json={
            "property_id": prop["id"],
            "landlord_id": ll["id"],
            "new_start_date": today.isoformat(),
            "new_expiry_date": (today + timedelta(days=365)).isoformat(),
            "new_monthly_rent": 9500,
        },
    )
    assert resp.status_code == 201
    data = resp.get_json()["data"]
    assert data["old_agreement"] is None
    assert data["new_agreement"]["is_active"] is True


def test_renewal_rejects_inverted_dates(client, auth_headers):
    prop = _make_property(client, auth_headers, "Inv")
    ll = _make_landlord(client, auth_headers, "L3")
    resp = client.post(
        "/api/v1/renewals", headers=auth_headers,
        json={
            "property_id": prop["id"],
            "landlord_id": ll["id"],
            "new_start_date": "2027-01-01",
            "new_expiry_date": "2026-01-01",
        },
    )
    assert resp.status_code == 400
    assert "expiry" in resp.get_json()["message"].lower()


# ---------- Maintenance ----------

def test_bed_maintenance_blocks_assignment(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP1")
    _, room, beds = _make_floor_room_bed(client, auth_headers, prop["id"])
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Ahmed", "gender": "male"},
    ).get_json()["data"]

    resp = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "bed", "entity_id": beds[0]["id"], "reason": "broken AC"},
    )
    assert resp.status_code == 201
    rec = resp.get_json()["data"]
    assert rec["transaction_number"].startswith("MAINT-")
    assert rec["prior_status"] == "empty"

    # Assigning to that bed is rejected
    bad = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    assert bad.status_code == 400
    assert "maintenance" in bad.get_json()["message"].lower()

    # Complete restores the bed
    done = client.post(
        f"/api/v1/maintenance/{rec['id']}/complete", headers=auth_headers,
        json={"actual_end_date": date.today().isoformat()},
    )
    assert done.status_code == 200
    assert done.get_json()["data"]["status"] == "completed"

    bed_after = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    by_code = {b["bed_code"]: b for b in bed_after}
    assert by_code[beds[0]["bed_code"]]["status"] == "empty"


def test_cannot_maintain_occupied_bed(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP2")
    _, _, beds = _make_floor_room_bed(client, auth_headers, prop["id"])
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Ahmed", "gender": "male"},
    ).get_json()["data"]
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    resp = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "bed", "entity_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "occupied" in resp.get_json()["message"].lower()


def test_room_maintenance_rejects_when_any_bed_occupied(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP3")
    _, room, beds = _make_floor_room_bed(client, auth_headers, prop["id"])
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Ahmed", "gender": "male"},
    ).get_json()["data"]
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    resp = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "room", "entity_id": room["id"]},
    )
    assert resp.status_code == 400


def test_room_maintenance_and_completion_recomputes(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP4")
    _, room, _ = _make_floor_room_bed(client, auth_headers, prop["id"])
    resp = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "room", "entity_id": room["id"], "reason": "deep clean"},
    )
    assert resp.status_code == 201
    rec = resp.get_json()["data"]

    room_now = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert room_now["occupancy_status"] == "maintenance"

    client.post(f"/api/v1/maintenance/{rec['id']}/complete", headers=auth_headers, json={})
    room_after = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert room_after["occupancy_status"] == "empty"


def test_duplicate_open_maintenance_rejected(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP5")
    _, _, beds = _make_floor_room_bed(client, auth_headers, prop["id"])
    first = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "bed", "entity_id": beds[0]["id"]},
    )
    assert first.status_code == 201
    dup = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "bed", "entity_id": beds[0]["id"]},
    )
    assert dup.status_code == 400


def test_property_maintenance_round_trip(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP6")
    resp = client.post(
        "/api/v1/maintenance", headers=auth_headers,
        json={"entity_type": "property", "entity_id": prop["id"], "reason": "fire safety"},
    )
    assert resp.status_code == 201
    rec = resp.get_json()["data"]
    # Property becomes inactive for assignment purposes
    p_now = client.get(f"/api/v1/properties/{prop['id']}", headers=auth_headers).get_json()["data"]
    assert p_now["status"] == "maintenance"
    # Complete restores
    client.post(f"/api/v1/maintenance/{rec['id']}/complete", headers=auth_headers, json={})
    p_after = client.get(f"/api/v1/properties/{prop['id']}", headers=auth_headers).get_json()["data"]
    assert p_after["status"] == "active"


def test_maintenance_list_filters(client, auth_headers):
    prop = _make_property(client, auth_headers, "MP7")
    _, _, beds = _make_floor_room_bed(client, auth_headers, prop["id"])
    client.post("/api/v1/maintenance", headers=auth_headers,
                json={"entity_type": "bed", "entity_id": beds[0]["id"]})
    rows = client.get("/api/v1/maintenance?entity_type=bed", headers=auth_headers).get_json()
    assert rows["meta"]["count"] >= 1
    by_prop = client.get(f"/api/v1/maintenance?property_id={prop['id']}", headers=auth_headers).get_json()
    assert by_prop["meta"]["count"] >= 1
