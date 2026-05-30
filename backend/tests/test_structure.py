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


# ---------- Phase 3: bunk-aware bulk bed create ----------


def test_bulk_three_singles_creates_three_beds(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Single P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=3)
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": [{"type": "single"}, {"type": "single"}, {"type": "single"}]},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert data["count"] == 3
    numbers = [b["bed_number"] for b in data["beds"]]
    types = [b["bed_type"] for b in data["beds"]]
    assert numbers == ["1", "2", "3"]
    assert types == ["single", "single", "single"]


def test_bulk_two_bunks_creates_four_beds_lower_upper(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Bunk P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    # capacity 4 to fit 2 bunk units (= 4 sleeping slots)
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=4)
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": [{"type": "bunk"}, {"type": "bunk"}]},
    )
    assert resp.status_code == 201, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert data["count"] == 4
    numbers = [b["bed_number"] for b in data["beds"]]
    types = [b["bed_type"] for b in data["beds"]]
    assert numbers == ["1L", "1U", "2L", "2U"]
    assert types == ["bunk_lower", "bunk_upper", "bunk_lower", "bunk_upper"]
    # bed_codes carry the L/U suffix end-to-end
    assert data["beds"][0]["bed_code"] == f"{prop['code']}-F1-R101-B1L"
    assert data["beds"][1]["bed_code"] == f"{prop['code']}-F1-R101-B1U"


def test_bulk_mixed_units(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Mix P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=4)
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": [{"type": "single"}, {"type": "bunk"}, {"type": "single"}]},
    )
    assert resp.status_code == 201
    data = resp.get_json()["data"]
    assert [b["bed_number"] for b in data["beds"]] == ["1", "2L", "2U", "3"]
    assert [b["bed_type"] for b in data["beds"]] == [
        "single", "bunk_lower", "bunk_upper", "single",
    ]


def test_bulk_capacity_overflow_rejected(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Cap P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    # 2 bunk units = 4 beds, room capacity is 2 → reject
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": [{"type": "bunk"}, {"type": "bunk"}]},
    )
    assert resp.status_code == 400
    assert "capacity" in resp.get_json()["message"].lower()
    # Nothing partially created
    listed = client.get(f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers).get_json()["data"]
    assert listed == []


def test_bulk_rejects_unknown_type(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Bad P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": [{"type": "queen"}]},
    )
    assert resp.status_code == 400
    assert "type" in resp.get_json()["message"].lower()


def test_structure_includes_employee_block_for_occupied_bed(app, client, auth_headers):
    """Phase 4: /structure returns current_employee for occupied beds."""
    # Create a property with a single 1-bed room.
    prop = _make_property(client, auth_headers, "Plan P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=1)
    bed = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]

    # Create an employee who needs accommodation.
    emp_resp = client.post(
        "/api/v1/employees", headers=auth_headers,
        json={
            "full_name": "Plan Tester",
            "accommodation_required": True,
            "status": "active",
        },
    )
    assert emp_resp.status_code == 201, emp_resp.get_data(as_text=True)
    emp = emp_resp.get_json()["data"]

    # Post an assignment via the real endpoint so all side effects fire.
    assign_resp = client.post(
        "/api/v1/assignments", headers=auth_headers,
        json={"employee_id": emp["id"], "bed_id": bed["id"]},
    )
    assert assign_resp.status_code == 201, assign_resp.get_data(as_text=True)

    struct = client.get(
        f"/api/v1/properties/{prop['id']}/structure", headers=auth_headers
    ).get_json()
    occupied_bed = struct["data"][0]["rooms"][0]["beds"][0]
    assert occupied_bed["status"] == "occupied"
    assert occupied_bed["current_employee"] is not None
    assert occupied_bed["current_employee"]["id"] == emp["id"]
    assert occupied_bed["current_employee"]["code"] == emp["code"]
    assert occupied_bed["current_employee"]["full_name"] == "Plan Tester"
    # division/designation are optional but the keys are always present
    assert "division_name" in occupied_bed["current_employee"]
    assert "designation" in occupied_bed["current_employee"]


def test_structure_employee_block_null_for_empty_bed(client, auth_headers):
    prop = _make_property(client, auth_headers, "Plan Empty P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=1)
    client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    )
    struct = client.get(
        f"/api/v1/properties/{prop['id']}/structure", headers=auth_headers
    ).get_json()
    bed = struct["data"][0]["rooms"][0]["beds"][0]
    assert bed["current_employee"] is None


def test_bulk_empty_list_rejected(client, auth_headers):
    prop = _make_property(client, auth_headers, "Bulk Empty P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    resp = client.post(
        f"/api/v1/rooms/{room['id']}/beds/bulk",
        headers=auth_headers,
        json={"units": []},
    )
    assert resp.status_code == 400


# ---------- Phase 5: bed/room actions visibly shift the occupancy summary ----------


def test_bed_maintenance_reflected_in_property_summary(client, auth_headers):
    """Phase 5b: marking a bed as maintenance shifts /occupancy counts."""
    prop = _make_property(client, auth_headers, "Maint P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    b1 = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]
    client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "2"},
    )

    before = client.get(
        f"/api/v1/properties/{prop['id']}/occupancy", headers=auth_headers
    ).get_json()["data"]
    assert before["beds"]["empty"] == 2
    assert before["beds"]["maintenance"] == 0

    resp = client.post(
        f"/api/v1/beds/{b1['id']}/status", headers=auth_headers,
        json={"status": "maintenance"},
    )
    assert resp.status_code == 200

    after = client.get(
        f"/api/v1/properties/{prop['id']}/occupancy", headers=auth_headers
    ).get_json()["data"]
    assert after["beds"]["empty"] == 1
    assert after["beds"]["maintenance"] == 1
    # And the bed itself reports the new status when re-read.
    refresh = client.get(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
    ).get_json()["data"]
    flipped = next(b for b in refresh if b["id"] == b1["id"])
    assert flipped["status"] == "maintenance"


# ---------- Phase 6: floor-scoped room renumbering ----------


def test_renumber_rooms_rewrites_room_numbers_and_bed_codes(client, auth_headers):
    prop = _make_property(client, auth_headers, "Renum P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    r1 = _make_room(client, auth_headers, floor["id"], "101", capacity=2)
    r2 = _make_room(client, auth_headers, floor["id"], "102", capacity=1)
    client.post(f"/api/v1/rooms/{r1['id']}/beds", headers=auth_headers, json={"bed_number": "1"})
    client.post(f"/api/v1/rooms/{r1['id']}/beds", headers=auth_headers, json={"bed_number": "2"})
    client.post(f"/api/v1/rooms/{r2['id']}/beds", headers=auth_headers, json={"bed_number": "1"})

    resp = client.post(
        f"/api/v1/properties/{prop['id']}/floors/{floor['id']}/renumber-rooms",
        headers=auth_headers,
        json={"room_prefix": "R"},
    )
    assert resp.status_code == 200, resp.get_data(as_text=True)
    data = resp.get_json()["data"]
    assert data["renamed"] == 2
    # Mapping is positional (sorted by old room_number ASC).
    diff = {d["room_id"]: d["new_room_number"] for d in data["diff"]}
    assert diff[r1["id"]] == "R101"
    assert diff[r2["id"]] == "R102"

    # Bed codes are recomputed for every bed in the renamed rooms.
    beds_r1 = client.get(f"/api/v1/rooms/{r1['id']}/beds", headers=auth_headers).get_json()["data"]
    bed_codes = sorted(b["bed_code"] for b in beds_r1)
    assert bed_codes == [
        f"{prop['code']}-F1-RR101-B1",
        f"{prop['code']}-F1-RR101-B2",
    ]


def test_renumber_rooms_refuses_with_occupied_bed_unless_forced(app, client, auth_headers):
    prop = _make_property(client, auth_headers, "Renum Occ P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=1)
    bed = client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    ).get_json()["data"]

    # Flip the bed to "occupied" directly (Phase 6 doesn't need a full
    # assignment txn for this guard test).
    with app.app_context():
        from app.extensions import db
        from app.models import Bed
        b = db.session.get(Bed, bed["id"])
        b.status = "occupied"
        db.session.commit()

    # Without force -> 409.
    resp = client.post(
        f"/api/v1/properties/{prop['id']}/floors/{floor['id']}/renumber-rooms",
        headers=auth_headers,
        json={"room_prefix": "X"},
    )
    assert resp.status_code == 409
    body = resp.get_json()
    assert body["details"]["occupied"] == 1
    assert body["details"]["force_required"] is True

    # With force -> 200 and the renumber proceeds.
    resp2 = client.post(
        f"/api/v1/properties/{prop['id']}/floors/{floor['id']}/renumber-rooms",
        headers=auth_headers,
        json={"room_prefix": "X", "force": True},
    )
    assert resp2.status_code == 200
    assert resp2.get_json()["data"]["renamed"] == 1


def test_renumber_rooms_swap_does_not_collide_on_unique(client, auth_headers):
    """Two rooms that effectively swap numbers via the new prefix must
    survive the UNIQUE(room_number) constraint — proves the two-phase
    rename works."""
    prop = _make_property(client, auth_headers, "Renum Swap P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    # Start with weird out-of-order names so the deterministic algorithm
    # has to actually move them.
    _make_room(client, auth_headers, floor["id"], "B-102", capacity=1)
    _make_room(client, auth_headers, floor["id"], "A-101", capacity=1)
    resp = client.post(
        f"/api/v1/properties/{prop['id']}/floors/{floor['id']}/renumber-rooms",
        headers=auth_headers,
        json={"room_prefix": ""},
    )
    assert resp.status_code == 200
    new_numbers = sorted(r["room_number"] for r in resp.get_json()["data"]["rooms"])
    assert new_numbers == ["101", "102"]


def test_room_blocked_reflected_in_property_summary(client, auth_headers):
    """Phase 5b: room.occupancy_status change shows in the room totals."""
    prop = _make_property(client, auth_headers, "Block P")
    floor = _make_floor(client, auth_headers, prop["id"], "1")
    room = _make_room(client, auth_headers, floor["id"], "101", capacity=1)
    client.post(
        f"/api/v1/rooms/{room['id']}/beds", headers=auth_headers,
        json={"bed_number": "1"},
    )

    resp = client.post(
        f"/api/v1/rooms/{room['id']}/status", headers=auth_headers,
        json={"status": "blocked"},
    )
    assert resp.status_code == 200

    summary = client.get(
        f"/api/v1/properties/{prop['id']}/occupancy", headers=auth_headers,
    ).get_json()["data"]
    assert summary["rooms"]["blocked"] == 1
    assert summary["rooms"]["total"] == 1
