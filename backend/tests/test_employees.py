import io
from openpyxl import Workbook


def _make_division(client, auth_headers, name="PUG Retail"):
    return client.post(
        "/api/v1/divisions",
        headers=auth_headers,
        json={"name": name, "company_name": "Paris United Group"},
    ).get_json()["data"]


def _xlsx_bytes(rows: list[dict]) -> bytes:
    wb = Workbook()
    ws = wb.active
    ws.title = "employees"
    columns = [
        "employee_code", "full_name", "qid_number", "passport_number",
        "visa_company", "division_code", "designation", "department",
        "nationality", "gender", "mobile_number", "joining_date",
        "accommodation_required", "accommodation_type", "status",
        "emergency_contact", "remarks",
    ]
    ws.append(columns)
    for row in rows:
        ws.append([row.get(c, "") for c in columns])
    buf = io.BytesIO()
    wb.save(buf)
    return buf.getvalue()


def test_employee_crud(client, auth_headers):
    division = _make_division(client, auth_headers)
    resp = client.post("/api/v1/employees", headers=auth_headers, json={
        "full_name": "Ahmed Al Mansoor",
        "qid_number": "12345678901",
        "division_id": division["id"],
        "designation": "Sales Executive",
        "gender": "male",
        "accommodation_type": "shared_room",
        "joining_date": "2024-04-01",
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert data["code"].startswith("EMP-")
    assert data["division"]["id"] == division["id"]

    # Duplicate QID rejected
    dup = client.post("/api/v1/employees", headers=auth_headers, json={
        "full_name": "Other", "qid_number": "12345678901",
    })
    assert dup.status_code == 409

    upd = client.put(f"/api/v1/employees/{data['id']}", headers=auth_headers,
                     json={"department": "Sales", "status": "on_vacation"})
    assert upd.status_code == 200
    assert upd.get_json()["data"]["status"] == "on_vacation"

    deactivated = client.delete(f"/api/v1/employees/{data['id']}", headers=auth_headers)
    assert deactivated.status_code == 200
    again = client.get(f"/api/v1/employees/{data['id']}", headers=auth_headers).get_json()["data"]
    assert again["status"] == "terminated"


def test_employee_validation(client, auth_headers):
    # Phase 4: schema-driven validation returns 422 with field-level
    # detail surfaced through our envelope's `details` key.
    bad = client.post("/api/v1/employees", headers=auth_headers, json={
        "full_name": "Bad", "gender": "robot",
    })
    assert bad.status_code == 422
    body = bad.get_json()
    assert body["success"] is False
    # error_processor flattens marshmallow's field error map into details.
    assert "gender" in str(body.get("details", "")).lower()


def test_employee_list_filters(client, auth_headers):
    d1 = _make_division(client, auth_headers, "Retail")
    d2 = _make_division(client, auth_headers, "Distribution")
    for name, div, status in [
        ("A", d1["id"], "active"),
        ("B", d1["id"], "on_vacation"),
        ("C", d2["id"], "active"),
    ]:
        client.post("/api/v1/employees", headers=auth_headers,
                    json={"full_name": name, "division_id": div, "status": status})

    only_retail = client.get(f"/api/v1/employees?division_id={d1['id']}", headers=auth_headers).get_json()
    assert only_retail["meta"]["count"] == 2
    vacation = client.get("/api/v1/employees?status=on_vacation", headers=auth_headers).get_json()
    assert vacation["meta"]["count"] == 1


def test_template_download(client, auth_headers):
    resp = client.get("/api/v1/employees/template", headers=auth_headers)
    assert resp.status_code == 200
    assert resp.mimetype == "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    assert resp.data[:2] == b"PK"  # xlsx is a zip


def test_excel_import_happy_path(client, auth_headers):
    division = _make_division(client, auth_headers)
    xlsx = _xlsx_bytes([
        {"full_name": "Alpha", "qid_number": "11111111111", "division_code": division["code"]},
        {"full_name": "Bravo", "qid_number": "22222222222", "division_code": division["code"]},
        {"employee_code": "EMP-99999", "full_name": "Charlie",
         "qid_number": "33333333333", "division_code": division["code"],
         "joining_date": "2024-05-15", "accommodation_type": "single_room"},
    ])
    resp = client.post(
        "/api/v1/employees/import",
        headers=auth_headers,
        data={"file": (io.BytesIO(xlsx), "employees.xlsx")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    body = resp.get_json()
    assert body["data"]["batch"]["status"] == "completed"
    assert body["data"]["batch"]["success_rows"] == 3
    assert body["data"]["created_count"] == 3

    listed = client.get("/api/v1/employees", headers=auth_headers).get_json()
    names = {e["full_name"] for e in listed["data"]}
    assert {"Alpha", "Bravo", "Charlie"}.issubset(names)
    # Explicit code preserved
    codes = {e["code"] for e in listed["data"]}
    assert "EMP-99999" in codes


def test_excel_import_validation_blocks_commit(client, auth_headers):
    division = _make_division(client, auth_headers)
    # First a clean employee already exists in the DB
    client.post("/api/v1/employees", headers=auth_headers, json={
        "full_name": "Existing", "qid_number": "44444444444",
    })

    xlsx = _xlsx_bytes([
        {"full_name": "Valid", "qid_number": "55555555555", "division_code": division["code"]},
        {"full_name": "Duplicate QID", "qid_number": "44444444444"},
        {"full_name": "Bad div", "qid_number": "66666666666", "division_code": "DIV-DOESNT-EXIST"},
        {"full_name": "", "qid_number": "77777777777"},
    ])
    resp = client.post(
        "/api/v1/employees/import",
        headers=auth_headers,
        data={"file": (io.BytesIO(xlsx), "errors.xlsx")},
        content_type="multipart/form-data",
    )
    assert resp.status_code == 200
    body = resp.get_json()
    assert body["data"]["batch"]["status"] == "failed"
    assert body["data"]["created_count"] == 0
    err_rows = body["data"]["errors"]
    assert len(err_rows) == 3

    # No employee called "Valid" was created
    listed = client.get("/api/v1/employees", headers=auth_headers).get_json()
    names = {e["full_name"] for e in listed["data"]}
    assert "Valid" not in names

    # Batch endpoint returns the same errors
    batch_id = body["data"]["batch"]["id"]
    batch_detail = client.get(f"/api/v1/employees/import-batches/{batch_id}", headers=auth_headers).get_json()["data"]
    assert batch_detail["status"] == "failed"
    assert len(batch_detail["errors"]) == 3


def test_excel_import_in_file_duplicates(client, auth_headers):
    xlsx = _xlsx_bytes([
        {"full_name": "A", "qid_number": "99999999999"},
        {"full_name": "B", "qid_number": "99999999999"},
    ])
    resp = client.post(
        "/api/v1/employees/import",
        headers=auth_headers,
        data={"file": (io.BytesIO(xlsx), "dup.xlsx")},
        content_type="multipart/form-data",
    )
    body = resp.get_json()
    assert body["data"]["batch"]["status"] == "failed"
    assert any("duplicated in this file" in e["errors"] for e in body["data"]["errors"])
