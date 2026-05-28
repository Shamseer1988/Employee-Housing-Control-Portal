def _seed(client, auth_headers):
    landlord = client.post("/api/v1/landlords", headers=auth_headers,
                           json={"name": "Searchable LL", "qid_cr_number": "CR-7777"}).get_json()["data"]
    prop = client.post("/api/v1/properties", headers=auth_headers,
                       json={"name": "FindMe Tower", "property_type": "full_building",
                             "city": "Doha", "landlord_id": landlord["id"]}).get_json()["data"]
    floor = client.post(f"/api/v1/properties/{prop['id']}/floors", headers=auth_headers,
                        json={"floor_number": "1"}).get_json()["data"]
    room = client.post(f"/api/v1/floors/{floor['id']}/rooms", headers=auth_headers,
                       json={"room_number": "707", "capacity": 1}).get_json()["data"]
    bed = client.post(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
                      json={"bed_number": "1"}).get_json()["data"]
    div = client.post("/api/v1/divisions", headers=auth_headers,
                      json={"name": "Search Test"}).get_json()["data"]
    emp = client.post("/api/v1/employees", headers=auth_headers,
                      json={"full_name": "Yusuf Findable", "division_id": div["id"],
                            "qid_number": "99988877766"}).get_json()["data"]
    return prop, room, bed, emp, landlord


def test_search_min_chars(client, auth_headers):
    r = client.get("/api/v1/search?q=a", headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert data["properties"] == []
    assert data["employees"] == []


def test_search_finds_property_by_name(client, auth_headers):
    prop, *_ = _seed(client, auth_headers)
    r = client.get("/api/v1/search?q=findme", headers=auth_headers)
    assert r.status_code == 200
    data = r.get_json()["data"]
    assert any(p["id"] == prop["id"] for p in data["properties"])
    assert data["properties"][0]["href"] == f"/properties/{prop['id']}"


def test_search_finds_employee_by_name_and_qid(client, auth_headers):
    _, _, _, emp, _ = _seed(client, auth_headers)
    r = client.get("/api/v1/search?q=findable", headers=auth_headers)
    assert any(e["id"] == emp["id"] for e in r.get_json()["data"]["employees"])
    r = client.get("/api/v1/search?q=99988877", headers=auth_headers)
    assert any(e["id"] == emp["id"] for e in r.get_json()["data"]["employees"])


def test_search_finds_bed_by_code(client, auth_headers):
    _, _, bed, _, _ = _seed(client, auth_headers)
    r = client.get(f"/api/v1/search?q={bed['bed_code'][:6]}", headers=auth_headers)
    assert any(b["id"] == bed["id"] for b in r.get_json()["data"]["beds"])


def test_search_finds_landlord_by_qid(client, auth_headers):
    _, _, _, _, ll = _seed(client, auth_headers)
    r = client.get("/api/v1/search?q=cr-7777", headers=auth_headers)
    assert any(x["id"] == ll["id"] for x in r.get_json()["data"]["landlords"])
