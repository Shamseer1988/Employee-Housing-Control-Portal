def _scaffold(client, auth_headers, n_beds=2):
    prop = client.post(
        "/api/v1/properties", headers=auth_headers,
        json={"name": "Move P", "property_type": "full_building"},
    ).get_json()["data"]
    floor = client.post(
        f"/api/v1/properties/{prop['id']}/floors", headers=auth_headers,
        json={"floor_number": "1"},
    ).get_json()["data"]
    room = client.post(
        f"/api/v1/floors/{floor['id']}/rooms", headers=auth_headers,
        json={"room_number": "101", "capacity": n_beds},
    ).get_json()["data"]
    beds = []
    for i in range(1, n_beds + 1):
        b = client.post(
            f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
            json={"bed_number": str(i)},
        ).get_json()["data"]
        beds.append(b)
    emp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Ahmed", "gender": "male", "qid_number": "11122233344"},
    ).get_json()["data"]
    return prop, floor, room, beds, emp


def _assign(client, auth_headers, emp, bed):
    resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": bed["id"]},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    return resp.get_json()["data"]


# ---------- Transfers ----------

def test_transfer_happy_path(client, auth_headers):
    _, _, room, beds, emp = _scaffold(client, auth_headers, n_beds=2)
    a1 = _assign(client, auth_headers, emp, beds[0])

    resp = client.post(
        "/api/v1/transfers", headers=auth_headers,
        json={"employee_id": emp["id"], "to_bed_id": beds[1]["id"], "reason": "bed_change"},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    t = resp.get_json()["data"]
    assert t["transaction_number"].startswith("TRANS-")
    assert t["from_bed"]["bed_code"] == beds[0]["bed_code"]
    assert t["to_bed"]["bed_code"] == beds[1]["bed_code"]

    # Old bed empty, new bed occupied
    b0 = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    by_code = {b["bed_code"]: b for b in b0}
    assert by_code[beds[0]["bed_code"]]["status"] == "empty"
    assert by_code[beds[1]["bed_code"]]["status"] == "occupied"

    # Employee snapshot points at new bed
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["current_bed"]["bed_code"] == beds[1]["bed_code"]

    # Old assignment archived
    assignments = client.get(f"/api/v1/assignments?employee_id={emp['id']}", headers=auth_headers).get_json()["data"]
    statuses = {a["transaction_number"]: a["status"] for a in assignments}
    assert statuses[a1["transaction_number"]] == "transferred"


def test_transfer_requires_existing_assignment(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    resp = client.post(
        "/api/v1/transfers", headers=auth_headers,
        json={"employee_id": emp["id"], "to_bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400
    assert "no active assignment" in resp.get_json()["message"].lower()


def test_transfer_rejects_occupied_target(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    other = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={"full_name": "Bilal", "gender": "male"},
    ).get_json()["data"]
    _assign(client, auth_headers, emp, beds[0])
    _assign(client, auth_headers, other, beds[1])
    resp = client.post(
        "/api/v1/transfers", headers=auth_headers,
        json={"employee_id": emp["id"], "to_bed_id": beds[1]["id"]},
    )
    assert resp.status_code == 400
    assert "occupied" in resp.get_json()["message"].lower()


def test_transfer_same_bed_rejected(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])
    resp = client.post(
        "/api/v1/transfers", headers=auth_headers,
        json={"employee_id": emp["id"], "to_bed_id": beds[0]["id"]},
    )
    assert resp.status_code == 400


# ---------- Cancellations ----------

def test_cancellation_releases_bed(client, auth_headers):
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])

    resp = client.post(
        "/api/v1/cancellations", headers=auth_headers,
        json={"employee_id": emp["id"], "reason": "resigned"},
    )
    assert resp.status_code == 201
    c = resp.get_json()["data"]
    assert c["transaction_number"].startswith("CANCEL-")

    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["current_bed"] is None
    assert emp_now["status"] == "resigned"

    rooms = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert rooms["occupancy_status"] == "empty"

    # Second cancellation rejected
    again = client.post(
        "/api/v1/cancellations", headers=auth_headers,
        json={"employee_id": emp["id"], "reason": "resigned"},
    )
    assert again.status_code == 400


def test_cancellation_reason_validated(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])
    resp = client.post(
        "/api/v1/cancellations", headers=auth_headers,
        json={"employee_id": emp["id"], "reason": "made_up_reason"},
    )
    assert resp.status_code == 400


def test_cancellation_terminated_status(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])
    resp = client.post(
        "/api/v1/cancellations", headers=auth_headers,
        json={"employee_id": emp["id"], "reason": "terminated"},
    )
    assert resp.status_code == 201
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["status"] == "terminated"


# ---------- Vacations ----------

def test_vacation_with_reserved_bed(client, auth_headers):
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])

    resp = client.post(
        "/api/v1/vacations", headers=auth_headers,
        json={
            "employee_id": emp["id"],
            "vacation_start_date": "2026-06-01",
            "vacation_end_date": "2026-06-21",
            "keep_bed_reserved": True,
        },
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    vac = resp.get_json()["data"]
    assert vac["status"] == "on_vacation"
    assert vac["keep_bed_reserved"] is True

    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["status"] == "on_vacation"
    # Bed kept by the employee but is now reserved
    assert emp_now["current_bed"] is not None

    bed_after = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    by_code = {b["bed_code"]: b for b in bed_after}
    assert by_code[beds[0]["bed_code"]]["status"] == "reserved"

    # Return
    ret = client.post(
        f"/api/v1/vacations/{vac['id']}/return", headers=auth_headers,
        json={"return_date": "2026-06-20"},
    )
    assert ret.status_code == 200
    assert ret.get_json()["data"]["status"] == "returned"

    emp_after = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_after["status"] == "active"
    bed_after2 = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    by_code2 = {b["bed_code"]: b for b in bed_after2}
    assert by_code2[beds[0]["bed_code"]]["status"] == "occupied"


def test_vacation_release_bed(client, auth_headers):
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    _assign(client, auth_headers, emp, beds[0])

    resp = client.post(
        "/api/v1/vacations", headers=auth_headers,
        json={
            "employee_id": emp["id"],
            "vacation_start_date": "2026-06-01",
            "keep_bed_reserved": False,
        },
    )
    assert resp.status_code == 201
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["status"] == "on_vacation"
    assert emp_now["current_bed"] is None

    bed_after = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    by_code = {b["bed_code"]: b for b in bed_after}
    assert by_code[beds[0]["bed_code"]]["status"] == "empty"


def test_vacation_without_assignment(client, auth_headers):
    _, _, _, _, emp = _scaffold(client, auth_headers)
    resp = client.post(
        "/api/v1/vacations", headers=auth_headers,
        json={"employee_id": emp["id"], "vacation_start_date": "2026-06-01"},
    )
    assert resp.status_code == 201
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["status"] == "on_vacation"


def test_employee_timeline_combines_events(client, auth_headers):
    _, _, _, beds, emp = _scaffold(client, auth_headers, n_beds=2)
    _assign(client, auth_headers, emp, beds[0])
    client.post("/api/v1/transfers", headers=auth_headers,
                json={"employee_id": emp["id"], "to_bed_id": beds[1]["id"], "reason": "bed_change"})
    client.post("/api/v1/cancellations", headers=auth_headers,
                json={"employee_id": emp["id"], "reason": "resigned"})

    timeline = client.get(f"/api/v1/employees/{emp['id']}/timeline", headers=auth_headers).get_json()["data"]
    types = [t["type"] for t in timeline]
    assert types.count("assignment") == 2
    assert "transfer" in types
    assert "cancellation" in types
