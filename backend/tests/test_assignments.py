def _scaffold(client, auth_headers, gender_allowed="any"):
    """Create a property with one floor, one room, two beds, and one employee."""
    prop = client.post(
        "/api/v1/properties", headers=auth_headers,
        json={"name": "Assign P", "property_type": "full_building"},
    ).get_json()["data"]
    floor = client.post(
        f"/api/v1/properties/{prop['id']}/floors", headers=auth_headers,
        json={"floor_number": "1"},
    ).get_json()["data"]
    room = client.post(
        f"/api/v1/floors/{floor['id']}/rooms", headers=auth_headers,
        json={"room_number": "101", "capacity": 2, "allowed_gender": gender_allowed},
    ).get_json()["data"]
    b1 = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]
    b2 = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "2"},
    ).get_json()["data"]
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Ahmed", "gender": "male", "qid_number": "11122233344"},
    ).get_json()["data"]
    return prop, floor, room, [b1, b2], emp


def test_available_beds_endpoint(client, auth_headers):
    prop, _, _, beds, _ = _scaffold(client, auth_headers)
    resp = client.get(f"/api/v1/beds/available?property_id={prop['id']}", headers=auth_headers)
    assert resp.status_code == 200
    data = resp.get_json()["data"]
    assert len(data) == 2
    assert {b["id"] for b in data} == {beds[0]["id"], beds[1]["id"]}
    assert data[0]["room"]["room_number"] == "101"


def test_assignment_happy_path(client, auth_headers):
    prop, _, room, beds, emp = _scaffold(client, auth_headers)
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"], "reason": "new joiner"},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    txn = resp.get_json()["data"]
    assert txn["status"] == "active"
    assert txn["transaction_number"].startswith("ASSIGN-")
    assert txn["bed"]["status"] == "occupied"

    # Employee snapshot reflects the assignment
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["current_bed"]["id"] == beds[0]["id"]
    assert emp_now["current_property"]["id"] == prop["id"]

    # Room status flipped to partially_occupied
    room_now = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert room_now["occupancy_status"] == "partially_occupied"

    # Available bed list lost the assigned bed
    avail = client.get(f"/api/v1/beds/available?property_id={prop['id']}", headers=auth_headers).get_json()["data"]
    assert {b["id"] for b in avail} == {beds[1]["id"]}


def test_cannot_assign_same_employee_twice(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    dup = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[1]["id"]},
    )
    assert dup.status_code == 400
    assert "already has an active assignment" in dup.get_json()["message"]


def test_cannot_assign_to_occupied_bed(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    other = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Bilal", "gender": "male"},
    ).get_json()["data"]
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": other["id"], "bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "occupied" in resp.get_json()["message"]


def test_gender_restriction(client, auth_headers):
    _, _, _, beds, _ = _scaffold(client, auth_headers, gender_allowed="female")
    male_emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Male", "gender": "male"},
    ).get_json()["data"]
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": male_emp["id"], "bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "female" in resp.get_json()["message"]

    # Female employee succeeds
    fem = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Aisha", "gender": "female"},
    ).get_json()["data"]
    ok = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": fem["id"], "bed_id": beds[0]["id"]},
    )
    assert ok.status_code == 201


def test_cannot_assign_when_accommodation_not_required(client, auth_headers):
    _, _, _, beds, _ = _scaffold(client, auth_headers)
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "WFH", "accommodation_required": False},
    ).get_json()["data"]
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "not requiring accommodation" in resp.get_json()["message"]


def test_cannot_assign_to_maintenance_bed(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    client.post(f"/api/v1/beds/{beds[0]['id']}/status", headers=auth_headers,
                json={"status": "maintenance"})
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "maintenance" in resp.get_json()["message"]


def test_room_becomes_full_when_all_beds_occupied(client, auth_headers):
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    other = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Khalid", "gender": "male"},
    ).get_json()["data"]
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": other["id"], "bed_id": beds[1]["id"]},
    )
    room_now = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert room_now["occupancy_status"] == "full"


def test_assignment_list_filters(client, auth_headers):
    prop, _, _, beds, emp = _scaffold(client, auth_headers)
    client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]},
    )
    by_emp = client.get(f"/api/v1/assignments?employee_id={emp['id']}", headers=auth_headers).get_json()
    assert by_emp["meta"]["count"] == 1
    by_prop = client.get(f"/api/v1/assignments?property_id={prop['id']}", headers=auth_headers).get_json()
    assert by_prop["meta"]["count"] == 1
    only_active = client.get("/api/v1/assignments?status=active", headers=auth_headers).get_json()
    assert only_active["meta"]["count"] == 1
