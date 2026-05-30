def _make_property(client, auth_headers, name="Test P", code=None):
    return client.post(
        "/api/v1/properties",
        headers=auth_headers,
        json={"name": name, "property_type": "full_building"},
    ).get_json()["data"]


def _make_floor(client, auth_headers, prop_id, number="1"):
    return client.post(
        f"/api/v1/properties/{prop_id}/floors",
        headers=auth_headers,
        json={"floor_number": number, "floor_name": f"Floor {number}"},
    ).get_json()["data"]


def _make_room(client, auth_headers, floor_id, number="101", capacity=2, room_type="shared"):
    return client.post(
        f"/api/v1/floors/{floor_id}/rooms",
        headers=auth_headers,
        json={"room_number": number, "capacity": capacity, "room_type": room_type},
    ).get_json()["data"]


def test_floor_and_room_flow(client, auth_headers):
    prop = _make_property(client, auth_headers)

    floor = _make_floor(client, auth_headers, prop["id"], "1")
    # Duplicate floor number rejected
    dup = client.post(
        f"/api/v1/properties/{prop['id']}/floors",
        headers=auth_headers,
        json={"floor_number": "1"},
    )
    assert dup.status_code == 409

    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    assert room["room_number"] == "101"
    assert room["capacity"] == 2
    assert room["occupancy_status"] == "empty"

    # Same room number on the same floor rejected
    dup_room = client.post(
        f"/api/v1/floors/{floor['id']}/rooms",
        headers=auth_headers,
        json={"room_number": "101", "capacity": 1},
    )
    assert dup_room.status_code == 409


def test_bed_capacity_and_codes(client, auth_headers):
    prop = _make_property(client, auth_headers, "Cap P")
    floor = _make_floor(client, auth_headers, prop["id"], "2")
    room = _make_room(client, auth_headers, floor["id"], "201", capacity=2)

    b1 = client.post(
        f"/api/v1/rooms/{room['id']}/beds",
        headers=auth_headers,
        json={"bed_number": "1"},
    )
    assert b1.status_code == 201
    assert b1.get_json()["data"]["bed_code"] == f"{prop['code']}-F2-R201-B1"

    b2 = client.post(
        f"/api/v1/rooms/{room['id']}/beds",
        headers=auth_headers,
        json={"bed_number": "2", "bed_type": "bunk_upper"},
    )
    assert b2.status_code == 201

    # Capacity exceeded
    over = client.post(
        f"/api/v1/rooms/{room['id']}/beds",
        headers=auth_headers,
        json={"bed_number": "3"},
    )
    assert over.status_code == 400
    assert "capacity" in over.get_json()["message"].lower()

    # Cannot shrink capacity below current bed count
    shrink = client.put(
        f"/api/v1/rooms/{room['id']}",
        headers=auth_headers,
        json={"capacity": 1},
    )
    assert shrink.status_code == 400


def test_bed_status_state_machine(client, auth_headers):
    prop = _make_property(client, auth_headers, "Status P")
    floor = _make_floor(client, auth_headers, prop["id"], "3")
    room = _make_room(client, auth_headers, floor["id"], "301", capacity=2)
    b1 = client.post(
        f"/api/v1/rooms/{room['id']}/beds",
        headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]

    # empty -> maintenance allowed
    r = client.post(
        f"/api/v1/beds/{b1['id']}/status", headers=auth_headers, json={"status": "maintenance"}
    )
    assert r.status_code == 200
    assert r.get_json()["data"]["status"] == "maintenance"

    # maintenance -> occupied not allowed manually
    bad = client.post(
        f"/api/v1/beds/{b1['id']}/status", headers=auth_headers, json={"status": "occupied"}
    )
    assert bad.status_code == 400

    # maintenance -> empty allowed
    back = client.post(
        f"/api/v1/beds/{b1['id']}/status", headers=auth_headers, json={"status": "empty"}
    )
    assert back.status_code == 200


def test_room_status_auto_recompute_via_db(app, client, auth_headers):
    prop = _make_property(client, auth_headers, "Auto P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    b1 = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]
    b2 = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "2"},
    ).get_json()["data"]

    # All beds empty -> room remains empty
    fresh = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert fresh["occupancy_status"] == "empty"

    # Simulate an assignment by flipping bed.status directly (Phase 6 will use a transaction)
    with app.app_context():
        from app.extensions import db
        from app.models import Bed, Room
        bed = db.session.get(Bed, b1["id"])
        bed.status = "occupied"
        db.session.get(Room, room["id"]).recompute_status()
        db.session.commit()

    again = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert again["occupancy_status"] == "partially_occupied"

    with app.app_context():
        from app.extensions import db
        from app.models import Bed, Room
        db.session.get(Bed, b2["id"]).status = "occupied"
        db.session.get(Room, room["id"]).recompute_status()
        db.session.commit()

    full = client.get(f"/api/v1/rooms/{room['id']}", headers=auth_headers).get_json()["data"]
    assert full["occupancy_status"] == "full"


def test_property_structure_and_occupancy(app, client, auth_headers):
    prop = _make_property(client, auth_headers, "Struct P")
    f1 = _make_floor(client, auth_headers, prop["id"], "1")
    f2 = _make_floor(client, auth_headers, prop["id"], "2")
    r1 = _make_room(client, auth_headers, f1["id"], "101", capacity=2)
    r2 = _make_room(client, auth_headers, f2["id"], "201", capacity=1)
    client.post(f"/api/v1/rooms/{r1['id']}/beds", headers=auth_headers, json={"bed_number": "1"})
    client.post(f"/api/v1/rooms/{r1['id']}/beds", headers=auth_headers, json={"bed_number": "2"})
    client.post(f"/api/v1/rooms/{r2['id']}/beds", headers=auth_headers, json={"bed_number": "1"})

    # Move one bed to maintenance manually
    bed_id = client.get(f"/api/v1/rooms/{r2['id']}/beds", headers=auth_headers).get_json()["data"][0]["id"]
    client.post(f"/api/v1/beds/{bed_id}/status", headers=auth_headers, json={"status": "maintenance"})

    struct = client.get(f"/api/v1/properties/{prop['id']}/structure", headers=auth_headers).get_json()
    assert struct["meta"]["count"] == 2
    assert struct["data"][0]["floor_number"] == "1"
    assert len(struct["data"][0]["rooms"]) == 1
    assert len(struct["data"][0]["rooms"][0]["beds"]) == 2

    summary = client.get(f"/api/v1/properties/{prop['id']}/occupancy", headers=auth_headers).get_json()["data"]
    assert summary["beds"]["total"] == 3
    assert summary["beds"]["empty"] == 2
    assert summary["beds"]["maintenance"] == 1
    assert summary["beds"]["occupied"] == 0
    assert summary["beds"]["occupancy_percent"] == 0.0
    assert summary["rooms"]["total"] == 2


def test_cannot_delete_floor_with_rooms(client, auth_headers):
    prop = _make_property(client, auth_headers, "Del P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    _make_room(client, auth_headers, floor["id"], "101")
    resp = client.delete(f"/api/v1/floors/{floor['id']}", headers=auth_headers)
    assert resp.status_code == 409


def test_cannot_delete_room_with_beds(client, auth_headers):
    prop = _make_property(client, auth_headers, "Del R P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101")
    client.post(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers, json={"bed_number": "1"})
    resp = client.delete(f"/api/v1/rooms/{room['id']}", headers=auth_headers)
    assert resp.status_code == 409


# ---------- Phase 2: property-creation layout generator ----------


def _create_with_layout(client, auth_headers, name, layout):
    return client.post(
        "/api/v1/properties",
        headers=auth_headers,
        json={"name": name, "property_type": "full_building", "layout": layout},
    )


def test_layout_creates_full_structure(client, auth_headers):
    resp = _create_with_layout(client, auth_headers, "Gen P", {
        "floors": 3, "rooms_per_floor": 4, "beds_per_room": 2,
    })
    assert resp.status_code == 201, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert data["layout_generated"] == {"floors": 3, "rooms": 12, "beds": 24}

    struct = client.get(
        f"/api/v1/properties/{data['id']}/structure", headers=auth_headers
    ).get_json()
    assert struct["meta"]["count"] == 3
    # Floor 1 → rooms 101..104 → 2 beds each, bed_code prefixed with PROP-Fn
    first_floor = struct["data"][0]
    assert first_floor["floor_number"] == "1"
    assert [r["room_number"] for r in first_floor["rooms"]] == ["101", "102", "103", "104"]
    first_room = first_floor["rooms"][0]
    assert first_room["capacity"] == 2
    assert [b["bed_code"] for b in first_room["beds"]] == [
        f"{data['code']}-F1-R101-B1",
        f"{data['code']}-F1-R101-B2",
    ]


def test_layout_ground_floor_naming(client, auth_headers):
    resp = _create_with_layout(client, auth_headers, "GF P", {
        "floors": 2, "rooms_per_floor": 2, "beds_per_room": 1,
        "ground_floor": True,
    })
    assert resp.status_code == 201
    data = resp.get_json()["data"]
    struct = client.get(
        f"/api/v1/properties/{data['id']}/structure", headers=auth_headers
    ).get_json()
    # Floor numbers ordered alphabetically by floor_number string: "1", "G".
    # Order isn't what we care about here — the SET of values is.
    floor_numbers = {f["floor_number"] for f in struct["data"]}
    assert floor_numbers == {"G", "1"}
    ground = next(f for f in struct["data"] if f["floor_number"] == "G")
    assert [r["room_number"] for r in ground["rooms"]] == ["G01", "G02"]


def test_layout_bounds_rejected(client, auth_headers):
    pre = client.get("/api/v1/properties", headers=auth_headers).get_json()["meta"]["count"]
    resp = _create_with_layout(client, auth_headers, "Bad P", {
        "floors": 51, "rooms_per_floor": 1, "beds_per_room": 1,
    })
    assert resp.status_code == 400
    assert "floors" in resp.get_json()["message"].lower()
    # Atomic: nothing committed when the layout is rejected.
    post = client.get("/api/v1/properties", headers=auth_headers).get_json()["meta"]["count"]
    assert post == pre


def test_layout_invalid_bed_type_rolls_back(client, auth_headers):
    pre = client.get("/api/v1/properties", headers=auth_headers).get_json()["meta"]["count"]
    resp = _create_with_layout(client, auth_headers, "Atomic P", {
        "floors": 1, "rooms_per_floor": 1, "beds_per_room": 1,
        "default_bed_type": "hammock",
    })
    assert resp.status_code == 400
    post = client.get("/api/v1/properties", headers=auth_headers).get_json()["meta"]["count"]
    assert post == pre


def test_layout_refuses_when_floors_exist(app, client, auth_headers):
    """The generator service refuses to re-build a property that already has floors."""
    prop = _make_property(client, auth_headers, "Reuse P")
    _make_floor(client, auth_headers, prop["id"], "1")
    with app.app_context():
        from app.extensions import db
        from app.models import Property, User
        from app.services import layout as layout_service
        p = db.session.get(Property, prop["id"])
        admin = User.query.filter_by(username="admin").one()
        try:
            layout_service.generate_structure(
                p, floors=2, rooms_per_floor=1, beds_per_room=1, actor=admin,
            )
            raised = False
        except layout_service.LayoutError:
            raised = True
        assert raised


def test_create_without_layout_unchanged(client, auth_headers):
    """Backward compat: creating a property without `layout` behaves exactly as before."""
    resp = client.post(
        "/api/v1/properties",
        headers=auth_headers,
        json={"name": "Bare P", "property_type": "full_building"},
    )
    assert resp.status_code == 201
    data = resp.get_json()["data"]
    assert "layout_generated" not in data
    struct = client.get(
        f"/api/v1/properties/{data['id']}/structure", headers=auth_headers
    ).get_json()
    assert struct["meta"]["count"] == 0
