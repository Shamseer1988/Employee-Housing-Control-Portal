import pytest
from datetime import date, timedelta


def _enable(app, key: str):
    """Flip a system setting on inside an app context."""
    from app.extensions import db
    from app.services import settings as settings_service
    with app.app_context():
        settings_service.set_value(key, True, actor_id=1)
        db.session.commit()


def _scaffold(client, auth_headers, n_beds=2):
    div = client.post("/api/v1/divisions", headers=auth_headers,
                      json={"name": "Retail"}).get_json()["data"]
    prop = client.post("/api/v1/properties", headers=auth_headers,
                       json={"name": "P", "property_type": "full_building"}).get_json()["data"]
    ll = client.post("/api/v1/landlords", headers=auth_headers, json={"name": "M"}).get_json()["data"]
    floor = client.post(f"/api/v1/properties/{prop['id']}/floors", headers=auth_headers,
                        json={"floor_number": "1"}).get_json()["data"]
    room = client.post(f"/api/v1/floors/{floor['id']}/rooms", headers=auth_headers,
                       json={"room_number": "101", "capacity": n_beds}).get_json()["data"]
    beds = [
        client.post(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
                    json={"bed_number": str(i)}).get_json()["data"]
        for i in range(1, n_beds + 1)
    ]
    emp = client.post("/api/v1/employees", headers=auth_headers,
                      json={"full_name": "Ahmed", "gender": "male",
                            "qid_number": "12345678901", "division_id": div["id"]}).get_json()["data"]
    return prop, ll, room, beds, emp


# ---------- Settings ----------

def test_seed_defaults_present(client, auth_headers):
    from app.services import settings as s
    assert s.get_bool("approval.assignment.required") is False
    assert s.get_bool("approval.transfer.required") is False
    assert s.get_bool("approval.cancellation.required") is False
    assert s.get_bool("approval.renewal.required") is False


# ---------- Assignment approval ----------

def test_assignment_with_approval_required_creates_pending(app, client, auth_headers):
    _enable(app, "approval.assignment.required")
    _, _, room, beds, emp = _scaffold(client, auth_headers)

    resp = client.post("/api/v1/assignments", headers=auth_headers,
                       json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    assert resp.status_code == 201
    txn = resp.get_json()["data"]
    assert txn["status"] == "pending_approval"

    # Bed and employee are unchanged
    bed_now = client.get(f"/api/v1/rooms/{room['id']}/beds",
                         headers=auth_headers).get_json()["data"][0]
    assert bed_now["status"] == "empty"
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["current_bed"] is None

    # Approval queue lists it
    queue = client.get("/api/v1/approvals?status=pending", headers=auth_headers).get_json()
    assert queue["meta"]["count"] == 1
    req = queue["data"][0]
    assert req["module"] == "assignment"
    assert req["entity_reference"] == txn["transaction_number"]


def test_approve_assignment_runs_side_effects(app, client, auth_headers):
    _enable(app, "approval.assignment.required")
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    req = client.get("/api/v1/approvals", headers=auth_headers).get_json()["data"][0]

    resp = client.post(f"/api/v1/approvals/{req['id']}/approve",
                       headers=auth_headers, json={"remarks": "ok"})
    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "approved"

    # Bed is now occupied; employee has current_bed
    bed_now = client.get(f"/api/v1/rooms/{room['id']}/beds",
                         headers=auth_headers).get_json()["data"][0]
    assert bed_now["status"] == "occupied"
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["current_bed"] is not None


def test_reject_assignment_does_not_change_state(app, client, auth_headers):
    _enable(app, "approval.assignment.required")
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    req = client.get("/api/v1/approvals", headers=auth_headers).get_json()["data"][0]

    resp = client.post(f"/api/v1/approvals/{req['id']}/reject",
                       headers=auth_headers, json={"remarks": "not now"})
    assert resp.status_code == 200
    assert resp.get_json()["data"]["status"] == "rejected"

    bed_now = client.get(f"/api/v1/rooms/{room['id']}/beds",
                         headers=auth_headers).get_json()["data"][0]
    assert bed_now["status"] == "empty"

    # Underlying record is marked rejected too
    txns = client.get(f"/api/v1/assignments?employee_id={emp['id']}",
                      headers=auth_headers).get_json()["data"]
    assert txns[0]["status"] == "rejected"


def test_cannot_create_second_pending_for_same_employee(app, client, auth_headers):
    _enable(app, "approval.assignment.required")
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    first = client.post("/api/v1/assignments", headers=auth_headers,
                        json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    assert first.status_code == 201
    second = client.post("/api/v1/assignments", headers=auth_headers,
                         json={"employee_id": emp["id"], "bed_id": beds[1]["id"]})
    assert second.status_code == 400
    assert "pending" in second.get_json()["message"].lower()


def test_approval_revalidates_at_decision_time(app, client, auth_headers):
    """If the bed is taken by someone else before approval, approve must fail."""
    _enable(app, "approval.assignment.required")
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    other = client.post("/api/v1/employees", headers=auth_headers,
                        json={"full_name": "Other", "gender": "male"}).get_json()["data"]

    # Two pending requests for the same bed
    a1 = client.post("/api/v1/assignments", headers=auth_headers,
                     json={"employee_id": emp["id"], "bed_id": beds[0]["id"]}).get_json()["data"]
    a2 = client.post("/api/v1/assignments", headers=auth_headers,
                     json={"employee_id": other["id"], "bed_id": beds[0]["id"]}).get_json()["data"]
    pending = client.get("/api/v1/approvals", headers=auth_headers).get_json()["data"]
    by_ref = {r["entity_reference"]: r for r in pending}

    ok = client.post(f"/api/v1/approvals/{by_ref[a1['transaction_number']]['id']}/approve",
                     headers=auth_headers, json={})
    assert ok.status_code == 200

    bad = client.post(f"/api/v1/approvals/{by_ref[a2['transaction_number']]['id']}/approve",
                      headers=auth_headers, json={})
    assert bad.status_code == 400
    assert "occupied" in bad.get_json()["message"].lower()


# ---------- Transfer approval ----------

def test_transfer_with_approval_required(app, client, auth_headers):
    _enable(app, "approval.transfer.required")
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})

    resp = client.post("/api/v1/transfers", headers=auth_headers,
                       json={"employee_id": emp["id"], "to_bed_id": beds[1]["id"], "reason": "bed_change"})
    assert resp.status_code == 201
    tx = resp.get_json()["data"]
    assert tx["status"] == "pending_approval"
    # Old bed still occupied, new bed still empty
    beds_now = {b["bed_code"]: b for b in client.get(f"/api/v1/rooms/{room['id']}/beds",
                                                     headers=auth_headers).get_json()["data"]}
    assert beds_now[beds[0]["bed_code"]]["status"] == "occupied"
    assert beds_now[beds[1]["bed_code"]]["status"] == "empty"

    req = client.get("/api/v1/approvals", headers=auth_headers).get_json()["data"][0]
    ok = client.post(f"/api/v1/approvals/{req['id']}/approve", headers=auth_headers, json={})
    assert ok.status_code == 200

    # After approval: old empty, new occupied
    beds_after = {b["bed_code"]: b for b in client.get(f"/api/v1/rooms/{room['id']}/beds",
                                                       headers=auth_headers).get_json()["data"]}
    assert beds_after[beds[0]["bed_code"]]["status"] == "empty"
    assert beds_after[beds[1]["bed_code"]]["status"] == "occupied"


# ---------- Cancellation approval ----------

def test_cancellation_with_approval_required(app, client, auth_headers):
    _enable(app, "approval.cancellation.required")
    _, _, room, beds, emp = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})

    resp = client.post("/api/v1/cancellations", headers=auth_headers,
                       json={"employee_id": emp["id"], "reason": "resigned"})
    assert resp.status_code == 201
    cx = resp.get_json()["data"]
    assert cx["status"] == "pending_approval"
    # Bed still occupied, employee still active
    bed_now = client.get(f"/api/v1/rooms/{room['id']}/beds",
                         headers=auth_headers).get_json()["data"][0]
    assert bed_now["status"] == "occupied"
    emp_now = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_now["status"] == "active"
    assert emp_now["current_bed"] is not None

    req = client.get("/api/v1/approvals?module=cancellation", headers=auth_headers).get_json()["data"][0]
    client.post(f"/api/v1/approvals/{req['id']}/approve", headers=auth_headers, json={})
    bed_after = client.get(f"/api/v1/rooms/{room['id']}/beds",
                           headers=auth_headers).get_json()["data"][0]
    assert bed_after["status"] == "empty"
    emp_after = client.get(f"/api/v1/employees/{emp['id']}", headers=auth_headers).get_json()["data"]
    assert emp_after["status"] == "resigned"


# ---------- Renewal approval ----------

def test_renewal_with_approval_required_keeps_old_active(app, client, auth_headers):
    _enable(app, "approval.renewal.required")
    prop, ll, _, _, _ = _scaffold(client, auth_headers)
    today = date.today()
    client.post(f"/api/v1/properties/{prop['id']}/agreements", headers=auth_headers,
                json={"landlord_id": ll["id"],
                      "start_date": (today - timedelta(days=200)).isoformat(),
                      "expiry_date": (today + timedelta(days=30)).isoformat(),
                      "monthly_rent": 10000})

    resp = client.post("/api/v1/renewals", headers=auth_headers,
                       json={"property_id": prop["id"], "landlord_id": ll["id"],
                             "new_start_date": (today + timedelta(days=31)).isoformat(),
                             "new_expiry_date": (today + timedelta(days=395)).isoformat(),
                             "new_monthly_rent": 11000})
    assert resp.status_code == 201
    renewal = resp.get_json()["data"]
    assert renewal["status"] == "pending_approval"

    agreements = client.get(f"/api/v1/properties/{prop['id']}/agreements",
                            headers=auth_headers).get_json()["data"]
    # Still exactly 1 active and 0 archived
    assert sum(a["is_active"] for a in agreements) == 1
    assert sum(not a["is_active"] for a in agreements) == 0

    req = client.get("/api/v1/approvals?module=renewal", headers=auth_headers).get_json()["data"][0]
    ok = client.post(f"/api/v1/approvals/{req['id']}/approve", headers=auth_headers, json={})
    assert ok.status_code == 200

    after = client.get(f"/api/v1/properties/{prop['id']}/agreements",
                       headers=auth_headers).get_json()["data"]
    assert sum(a["is_active"] for a in after) == 1
    assert sum(not a["is_active"] for a in after) == 1
    new_active = next(a for a in after if a["is_active"])
    assert new_active["monthly_rent"] == 11000.0


def test_pending_counts(app, client, auth_headers):
    _enable(app, "approval.assignment.required")
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    client.post("/api/v1/assignments", headers=auth_headers,
                json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    resp = client.get("/api/v1/approvals/counts", headers=auth_headers)
    counts = resp.get_json()["data"]
    assert counts["assignment"] == 1
    assert counts["total"] == 1


def test_approvals_require_auth(client):
    resp = client.get("/api/v1/approvals")
    assert resp.status_code == 401


def test_synchronous_path_still_works_without_setting(client, auth_headers):
    """When the toggle is off (default) everything goes through immediately."""
    _, _, _, beds, emp = _scaffold(client, auth_headers)
    resp = client.post("/api/v1/assignments", headers=auth_headers,
                       json={"employee_id": emp["id"], "bed_id": beds[0]["id"]})
    assert resp.status_code == 201
    assert resp.get_json()["data"]["status"] == "active"
    queue = client.get("/api/v1/approvals", headers=auth_headers).get_json()
    assert queue["meta"]["count"] == 0
