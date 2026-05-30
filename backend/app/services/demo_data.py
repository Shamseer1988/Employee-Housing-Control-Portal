"""Demo data seeder. Idempotent: skips entities that already exist by code."""
from __future__ import annotations

from datetime import date, timedelta

import click

from ..extensions import db
from ..models import (
    Bed, Division, Employee, Floor, Landlord, Property, PropertyAgreement, Room,
)
from ..models.assignment import generate_transaction_number
from .codes import next_code, prefix_for


def _today() -> date:
    return date.today()


def _ensure_landlord(name: str, **fields) -> Landlord:
    existing = Landlord.query.filter_by(name=name).first()
    if existing:
        return existing
    code = next_code(Landlord, prefix_for("landlord"))
    ll = Landlord(code=code, name=name, status="active", **fields)
    db.session.add(ll)
    db.session.flush()
    return ll


def _ensure_division(name: str, **fields) -> Division:
    existing = Division.query.filter_by(name=name).first()
    if existing:
        return existing
    code = next_code(Division, prefix_for("division"))
    div = Division(code=code, name=name, status="active", **fields)
    db.session.add(div)
    db.session.flush()
    return div


def _ensure_property(name: str, landlord: Landlord, **fields) -> Property:
    existing = Property.query.filter_by(name=name).first()
    if existing:
        return existing
    code = next_code(Property, prefix_for("property"))
    p = Property(code=code, name=name, landlord_id=landlord.id, status="active", **fields)
    db.session.add(p)
    db.session.flush()
    return p


def _ensure_floor(prop: Property, number: str) -> Floor:
    f = Floor.query.filter_by(property_id=prop.id, floor_number=number).first()
    if f:
        return f
    f = Floor(property_id=prop.id, floor_number=number, floor_name=f"Floor {number}",
              status="active")
    db.session.add(f)
    db.session.flush()
    return f


def _ensure_room(prop: Property, floor: Floor, number: str, capacity: int = 2,
                 gender: str = "any") -> Room:
    r = Room.query.filter_by(
        property_id=prop.id, floor_id=floor.id, room_number=number,
    ).first()
    if r:
        return r
    r = Room(
        property_id=prop.id, floor_id=floor.id,
        room_number=number, room_type="shared", capacity=capacity,
        allowed_gender=gender, has_bathroom=True, has_ac=True,
        occupancy_status="empty",
    )
    db.session.add(r)
    db.session.flush()
    return r


def _ensure_bed(room: Room, bed_number: str) -> Bed:
    b = Bed.query.filter_by(room_id=room.id, bed_number=bed_number).first()
    if b:
        return b
    from .occupancy import bed_code
    code = bed_code(room.property.code, room.floor.floor_number, room.room_number, bed_number)
    b = Bed(
        property_id=room.property_id, floor_id=room.floor_id, room_id=room.id,
        bed_number=bed_number, bed_code=code, bed_type="single", status="empty",
    )
    db.session.add(b)
    db.session.flush()
    return b


def _ensure_agreement(prop: Property, landlord: Landlord, start: date, expiry: date,
                      monthly_rent: float, actor_id: int) -> PropertyAgreement:
    existing = (
        PropertyAgreement.query
        .filter_by(property_id=prop.id, is_active=True)
        .first()
    )
    if existing:
        return existing
    ag = PropertyAgreement(
        property_id=prop.id, landlord_id=landlord.id,
        start_date=start, expiry_date=expiry, monthly_rent=monthly_rent,
        is_active=True, reminder_days_before_expiry=90,
        created_by=actor_id, updated_by=actor_id,
    )
    db.session.add(ag)
    db.session.flush()
    return ag


def _ensure_employee(full_name: str, **fields) -> Employee:
    existing = Employee.query.filter_by(full_name=full_name).first()
    if existing:
        return existing
    code = next_code(Employee, prefix_for("employee"), width=5)
    e = Employee(code=code, full_name=full_name, status="active",
                 accommodation_required=True, **fields)
    db.session.add(e)
    db.session.flush()
    return e


def seed_all(actor_id: int = 1) -> dict:
    """Create a representative demo dataset.

    Returns counts so the CLI can show a summary.
    """
    today = _today()

    # ---- Landlords (master only) ----
    al_mansoor = _ensure_landlord(
        "Al Mansoor Properties",
        qid_cr_number="CR-1001", mobile="+97455551001",
        email="contact@almansoor.qa", contact_person="Ahmed Al Mansoor",
        created_by=actor_id, updated_by=actor_id,
    )
    al_faris = _ensure_landlord(
        "Al Faris Holdings",
        qid_cr_number="CR-1002", mobile="+97455551002",
        email="leasing@alfaris.qa", contact_person="Salem Al Faris",
        created_by=actor_id, updated_by=actor_id,
    )
    doha_properties = _ensure_landlord(
        "Doha Properties LLC",
        qid_cr_number="CR-1003", mobile="+97455551003",
        email="info@dohaproperties.qa", contact_person="Khalid Al Thani",
        created_by=actor_id, updated_by=actor_id,
    )
    qatar_estates = _ensure_landlord(
        "Qatar Estates",
        qid_cr_number="CR-1004", mobile="+97455551004",
        email="rentals@qestates.qa", contact_person="Fatima Al Kuwari",
        created_by=actor_id, updated_by=actor_id,
    )

    # ---- Divisions ----
    hq          = _ensure_division("Head Office", company_name="Paris United Group",
                                   division_type="head_office", location="Doha",
                                   manager="Omar Al Khalifa", staff_count=15,
                                   created_by=actor_id, updated_by=actor_id)
    retail_n    = _ensure_division("Retail – North", company_name="PUG Retail",
                                   division_type="retail", location="Lusail",
                                   manager="Yusuf Rahman", staff_count=22,
                                   created_by=actor_id, updated_by=actor_id)
    retail_s    = _ensure_division("Retail – South", company_name="PUG Retail",
                                   division_type="retail", location="Al Wakra",
                                   manager="Mariam Al Sulaiti", staff_count=18,
                                   created_by=actor_id, updated_by=actor_id)
    distribution = _ensure_division("Distribution", company_name="PUG Distribution",
                                    division_type="distribution", location="Industrial Area",
                                    manager="Bilal Hussain", staff_count=14,
                                    created_by=actor_id, updated_by=actor_id)
    services    = _ensure_division("Services", company_name="PUG Services",
                                   division_type="services", location="Doha",
                                   manager="Aisha Khan", staff_count=8,
                                   created_by=actor_id, updated_by=actor_id)
    project_a   = _ensure_division("Project Alpha", company_name="PUG Projects",
                                   division_type="project", location="Lusail",
                                   manager="Tariq Mahmoud", staff_count=12,
                                   created_by=actor_id, updated_by=actor_id)

    # ---- Properties (master only — counts are computed from structure) ----
    p1 = _ensure_property(
        "Doha Building 12", al_mansoor,
        property_type="full_building", building_number="12",
        zone="27", street="Salwa Road", area="Najma", city="Doha",
        managed_by="HR Admin", created_by=actor_id, updated_by=actor_id,
    )
    p2 = _ensure_property(
        "Lusail Villa 7", al_faris,
        property_type="villa", building_number="V7",
        zone="69", street="Marina Boulevard", area="Marina District", city="Lusail",
        managed_by="HR Admin", created_by=actor_id, updated_by=actor_id,
    )
    p3 = _ensure_property(
        "Industrial Camp A", doha_properties,
        property_type="labour_camp", building_number="CA",
        zone="57", street="Gate 9", area="Industrial Area", city="Doha",
        managed_by="Camp Boss", created_by=actor_id, updated_by=actor_id,
    )
    p4 = _ensure_property(
        "Wakra Staff Flats", qatar_estates,
        property_type="apartment", building_number="WSF-3",
        zone="91", street="Al Wakra Main", area="Old Wakra", city="Al Wakra",
        managed_by="HR Admin", created_by=actor_id, updated_by=actor_id,
    )

    properties = [p1, p2, p3, p4]

    # ---- Agreements (mixed expiry buckets so the dashboard alerts surface) ----
    _ensure_agreement(p1, al_mansoor,
                      start=today - timedelta(days=720),
                      expiry=today + timedelta(days=5),     # critical (7-day bucket)
                      monthly_rent=18000, actor_id=actor_id)
    _ensure_agreement(p2, al_faris,
                      start=today - timedelta(days=900),
                      expiry=today - timedelta(days=10),    # expired
                      monthly_rent=12500, actor_id=actor_id)
    _ensure_agreement(p3, doha_properties,
                      start=today - timedelta(days=200),
                      expiry=today + timedelta(days=500),   # safe
                      monthly_rent=22000, actor_id=actor_id)
    _ensure_agreement(p4, qatar_estates,
                      start=today - timedelta(days=300),
                      expiry=today + timedelta(days=45),    # 60-day bucket
                      monthly_rent=15500, actor_id=actor_id)

    # ---- Floors / rooms / beds ----
    beds: list[Bed] = []
    for prop, floor_numbers, rooms_per_floor in [
        (p1, ["1", "2", "3"], 4),
        (p2, ["G", "1"], 3),
        (p3, ["1", "2"], 4),
        (p4, ["1", "2"], 3),
    ]:
        for fn in floor_numbers:
            floor = _ensure_floor(prop, fn)
            for ri in range(1, rooms_per_floor + 1):
                rn = f"{fn}{ri:02d}" if fn.isdigit() else f"{fn}{ri}"
                cap = 4 if prop is p3 else 2
                room = _ensure_room(prop, floor, rn, capacity=cap)
                for bi in range(1, cap + 1):
                    beds.append(_ensure_bed(room, str(bi)))

    # ---- Employees ----
    employees_spec = [
        # (name, division, gender, nationality, designation, qid, mobile)
        ("Ahmed Al Mansouri",      retail_n,     "male",   "Qatari",     "Sales Manager",      "28412345671", "+97455553001"),
        ("Bilal Hussain",          distribution, "male",   "Pakistani",  "Driver",             "28412345672", "+97455553002"),
        ("Carlos Mendoza",         services,     "male",   "Filipino",   "Technician",         "28412345673", "+97455553003"),
        ("Deepika Sharma",         hq,           "female", "Indian",     "HR Executive",       "28412345674", "+97455553004"),
        ("Eyad Mahmoud",           retail_n,     "male",   "Egyptian",   "Cashier",            "28412345675", "+97455553005"),
        ("Faisal Al Kuwari",       project_a,    "male",   "Qatari",     "Site Engineer",      "28412345676", "+97455553006"),
        ("Gita Patel",             hq,           "female", "Indian",     "Accountant",         "28412345677", "+97455553007"),
        ("Hamza Ali",              distribution, "male",   "Pakistani",  "Warehouse Lead",     "28412345678", "+97455553008"),
        ("Ibrahim Khan",           retail_s,     "male",   "Pakistani",  "Store Supervisor",   "28412345679", "+97455553009"),
        ("Jameela Al Sulaiti",     retail_s,     "female", "Qatari",     "Customer Service",   "28412345680", "+97455553010"),
        ("Karim Saleh",            services,     "male",   "Egyptian",   "Maintenance",        "28412345681", "+97455553011"),
        ("Lina Al Thani",          hq,           "female", "Qatari",     "Project Coordinator","28412345682", "+97455553012"),
        ("Mahmoud Iqbal",          project_a,    "male",   "Pakistani",  "Carpenter",          "28412345683", "+97455553013"),
        ("Nadia Hassan",           hq,           "female", "Sudanese",   "Admin Assistant",    "28412345684", "+97455553014"),
        ("Omar Fathi",             retail_n,     "male",   "Egyptian",   "Sales Associate",    "28412345685", "+97455553015"),
        ("Priya Kumar",            services,     "female", "Indian",     "Customer Care",      "28412345686", "+97455553016"),
        ("Qasim Sheikh",           distribution, "male",   "Pakistani",  "Logistics Clerk",    "28412345687", "+97455553017"),
        ("Reema Al Naimi",         retail_s,     "female", "Qatari",     "Branch Manager",     "28412345688", "+97455553018"),
        ("Salim Bin Saif",         project_a,    "male",   "Omani",      "Foreman",            "28412345689", "+97455553019"),
        ("Tariq Mahmoud",          project_a,    "male",   "Jordanian",  "Project Lead",       "28412345690", "+97455553020"),
        ("Umar Khan",              distribution, "male",   "Pakistani",  "Driver",             "28412345691", "+97455553021"),
        ("Vasanthi Iyer",          hq,           "female", "Indian",     "IT Support",         "28412345692", "+97455553022"),
        ("Walid Abdullah",         retail_n,     "male",   "Yemeni",     "Visual Merchandiser","28412345693", "+97455553023"),
        ("Xena Al Marri",          retail_s,     "female", "Qatari",     "Sales Associate",    "28412345694", "+97455553024"),
        ("Yusuf Rahman",           retail_n,     "male",   "Bangladeshi","Regional Manager",   "28412345695", "+97455553025"),
        ("Zainab Khalid",          services,     "female", "Pakistani",  "Receptionist",       "28412345696", "+97455553026"),
        ("Anas Othman",            distribution, "male",   "Tunisian",   "Loader",             "28412345697", "+97455553027"),
        ("Brenda Santos",          services,     "female", "Filipino",   "Cleaner",            "28412345698", "+97455553028"),
        ("Chandra Reddy",          hq,           "male",   "Indian",     "Senior Accountant",  "28412345699", "+97455553029"),
        ("Dalia Hassan",           hq,           "female", "Egyptian",   "Compliance Officer", "28412345700", "+97455553030"),
    ]

    employees: list[Employee] = []
    for name, div, gender, nationality, designation, qid, mobile in employees_spec:
        e = _ensure_employee(
            name,
            division_id=div.id,
            gender=gender,
            nationality=nationality,
            designation=designation,
            qid_number=qid,
            mobile_number=mobile,
            joining_date=today - timedelta(days=120),
            accommodation_type="shared_room",
            visa_company="PUG Group",
            created_by=actor_id, updated_by=actor_id,
        )
        employees.append(e)

    # ---- Assignments (post a handful) ----
    from .assignments import post_assignment, AssignmentError
    posted = 0
    empty_beds = [b for b in beds if b.status == "empty"]
    for emp, bed in zip(employees, empty_beds):
        # Match gender filter
        if bed.room.allowed_gender not in ("any", emp.gender or "any"):
            continue
        if emp.current_bed_id:
            continue
        if posted >= 18:  # leave some beds empty for testing
            break
        try:
            post_assignment(employee_id=emp.id, bed_id=bed.id, actor_id=actor_id)
            posted += 1
        except AssignmentError:
            continue

    db.session.commit()

    return {
        "landlords": Landlord.query.count(),
        "divisions": Division.query.count(),
        "properties": Property.query.count(),
        "floors": Floor.query.count(),
        "rooms": Room.query.count(),
        "beds": Bed.query.count(),
        "employees": Employee.query.count(),
        "assignments_posted": posted,
    }
