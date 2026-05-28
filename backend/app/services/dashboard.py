from datetime import date, datetime, timedelta
from sqlalchemy import func, case

from ..extensions import db
from ..models import (
    Property, Floor, Room, Bed, Employee, Landlord, PropertyAgreement, MaintenanceRecord,
    AccommodationAssignment, AccommodationTransfer, AccommodationCancellation,
    EmployeeVacation, LandlordRenewal,
)
from .reminders import agreement_bucket, reminder_summary


def _bed_counts() -> dict:
    rows = (
        db.session.query(Bed.status, func.count(Bed.id))
        .group_by(Bed.status)
        .all()
    )
    counts = {"total": 0, "empty": 0, "occupied": 0, "reserved": 0, "maintenance": 0, "blocked": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
        counts["total"] += n
    counts["occupancy_percent"] = (
        round(counts["occupied"] * 100.0 / counts["total"], 1) if counts["total"] else 0.0
    )
    return counts


def _room_counts() -> dict:
    rows = (
        db.session.query(Room.occupancy_status, func.count(Room.id))
        .group_by(Room.occupancy_status)
        .all()
    )
    counts = {"total": 0, "empty": 0, "partially_occupied": 0, "full": 0, "maintenance": 0, "blocked": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
        counts["total"] += n
    return counts


def _employee_counts() -> dict:
    rows = (
        db.session.query(Employee.status, func.count(Employee.id))
        .group_by(Employee.status)
        .all()
    )
    by_status = {"active": 0, "on_vacation": 0, "transferred": 0, "visa_cancelled": 0,
                 "resigned": 0, "terminated": 0}
    total = 0
    for status, n in rows:
        by_status[status] = by_status.get(status, 0) + n
        total += n
    assigned = (
        db.session.query(func.count(Employee.id))
        .filter(Employee.current_bed_id.isnot(None))
        .scalar() or 0
    )
    needs = (
        db.session.query(func.count(Employee.id))
        .filter(Employee.accommodation_required.is_(True))
        .filter(Employee.status.in_(("active", "on_vacation")))
        .scalar() or 0
    )
    return {
        "total": total,
        "by_status": by_status,
        "assigned": assigned,
        "not_assigned_needing": max(needs - assigned, 0),
        "on_vacation": by_status.get("on_vacation", 0),
    }


def _property_counts() -> dict:
    rows = (
        db.session.query(Property.status, func.count(Property.id))
        .group_by(Property.status)
        .all()
    )
    counts = {"total": 0, "active": 0, "inactive": 0, "maintenance": 0, "vacated": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
        counts["total"] += n
    counts["floors"] = db.session.query(func.count(Floor.id)).scalar() or 0
    counts["agreements_active"] = (
        db.session.query(func.count(PropertyAgreement.id))
        .filter(PropertyAgreement.is_active.is_(True))
        .scalar() or 0
    )
    return counts


def _maintenance_counts() -> dict:
    rows = (
        db.session.query(MaintenanceRecord.status, func.count(MaintenanceRecord.id))
        .group_by(MaintenanceRecord.status)
        .all()
    )
    counts = {"in_progress": 0, "completed": 0, "cancelled": 0}
    for status, n in rows:
        counts[status] = counts.get(status, 0) + n
    return counts


def summary() -> dict:
    return {
        "properties": _property_counts(),
        "rooms": _room_counts(),
        "beds": _bed_counts(),
        "employees": _employee_counts(),
        "agreements": {"expiry_buckets": reminder_summary()},
        "maintenance": _maintenance_counts(),
        "generated_at": datetime.utcnow().isoformat(),
    }


def occupancy_by_property(limit: int = 20) -> list[dict]:
    """Per-property bed totals + occupied count, ordered by total desc."""
    rows = (
        db.session.query(
            Property.id, Property.code, Property.name,
            func.count(Bed.id).label("total"),
            func.sum(case((Bed.status == "occupied", 1), else_=0)).label("occupied"),
            func.sum(case((Bed.status == "empty", 1), else_=0)).label("empty"),
            func.sum(case((Bed.status == "reserved", 1), else_=0)).label("reserved"),
            func.sum(case((Bed.status == "maintenance", 1), else_=0)).label("maintenance"),
        )
        .outerjoin(Bed, Bed.property_id == Property.id)
        .group_by(Property.id, Property.code, Property.name)
        .order_by(func.count(Bed.id).desc())
        .limit(limit)
        .all()
    )
    out = []
    for r in rows:
        total = int(r.total or 0)
        occ = int(r.occupied or 0)
        out.append({
            "property_id": r.id,
            "code": r.code,
            "name": r.name,
            "total": total,
            "occupied": occ,
            "empty": int(r.empty or 0),
            "reserved": int(r.reserved or 0),
            "maintenance": int(r.maintenance or 0),
            "occupancy_percent": round(occ * 100.0 / total, 1) if total else 0.0,
        })
    return out


def occupancy_by_division() -> list[dict]:
    """Active employees per division grouped by assigned vs not assigned."""
    rows = (
        db.session.query(
            Employee.division_id,
            func.count(Employee.id).label("total"),
            func.sum(case((Employee.current_bed_id.isnot(None), 1), else_=0)).label("assigned"),
        )
        .filter(Employee.accommodation_required.is_(True))
        .group_by(Employee.division_id)
        .all()
    )
    from ..models import Division
    div_index = {d.id: d for d in Division.query.all()}
    out = []
    for r in rows:
        d = div_index.get(r.division_id)
        out.append({
            "division_id": r.division_id,
            "division_code": d.code if d else None,
            "division_name": d.name if d else "Unassigned",
            "total": int(r.total or 0),
            "assigned": int(r.assigned or 0),
            "not_assigned": int((r.total or 0) - (r.assigned or 0)),
        })
    out.sort(key=lambda x: x["total"], reverse=True)
    return out


def monthly_movement(months: int = 6) -> list[dict]:
    """Per-month counts of assignments, transfers, cancellations, vacations.

    Returns `months` rows ending at the current month.
    """
    today = date.today()
    year, month = today.year, today.month
    keys: list[date] = []
    # Walk backwards `months - 1` steps from this month
    for offset in range(months - 1, -1, -1):
        m = month - offset
        y = year
        while m <= 0:
            m += 12
            y -= 1
        keys.append(date(y, m, 1))
    first_of_window = keys[0]

    def _by_month(model, date_col):
        rows = (
            db.session.query(
                func.strftime("%Y-%m", date_col).label("ym"),
                func.count(model.id),
            )
            .filter(date_col >= first_of_window)
            .group_by("ym")
            .all()
        )
        return {ym: n for ym, n in rows}

    # Aggregate in Python — works identically on SQLite, Postgres, MySQL,
    # never depends on dialect-specific date functions, and never leaves
    # the session in an aborted state if a query fails.
    def _by_month(model, date_col):
        rows = (
            db.session.query(date_col)
            .filter(date_col.isnot(None))
            .filter(date_col >= first_of_window)
            .all()
        )
        counts: dict[str, int] = {}
        for (d,) in rows:
            if d is None:
                continue
            key = d.strftime("%Y-%m")
            counts[key] = counts.get(key, 0) + 1
        return counts

    ass = _by_month(AccommodationAssignment, AccommodationAssignment.assignment_date)
    trn = _by_month(AccommodationTransfer, AccommodationTransfer.transfer_date)
    canc = _by_month(AccommodationCancellation, AccommodationCancellation.cancellation_date)
    vac = _by_month(EmployeeVacation, EmployeeVacation.vacation_start_date)

    out = []
    for d in keys:
        key = d.strftime("%Y-%m")
        out.append({
            "month": key,
            "assignments": int(ass.get(key, 0)),
            "transfers": int(trn.get(key, 0)),
            "cancellations": int(canc.get(key, 0)),
            "vacations": int(vac.get(key, 0)),
        })
    return out


def _label(typ: str, model, instance) -> dict:
    base = {
        "type": typ,
        "id": instance.id,
        "transaction_number": getattr(instance, "transaction_number", None),
        "created_at": instance.created_at.isoformat() if instance.created_at else None,
    }
    if hasattr(instance, "employee") and instance.employee is not None:
        base["employee"] = {"id": instance.employee.id, "full_name": instance.employee.full_name}
    if hasattr(instance, "property") and instance.property is not None:
        base["property"] = {"id": instance.property.id, "name": instance.property.name}
    return base


def recent_activity(limit: int = 15) -> list[dict]:
    items = []
    for a in AccommodationAssignment.query.order_by(AccommodationAssignment.id.desc()).limit(limit).all():
        d = _label("assignment", AccommodationAssignment, a)
        d["bed_code"] = a.bed.bed_code if a.bed else None
        d["status"] = a.status
        items.append(d)
    for t in AccommodationTransfer.query.order_by(AccommodationTransfer.id.desc()).limit(limit).all():
        d = _label("transfer", AccommodationTransfer, t)
        d["from_bed_code"] = t.from_bed.bed_code if t.from_bed else None
        d["to_bed_code"] = t.to_bed.bed_code if t.to_bed else None
        items.append(d)
    for c in AccommodationCancellation.query.order_by(AccommodationCancellation.id.desc()).limit(limit).all():
        d = _label("cancellation", AccommodationCancellation, c)
        d["reason"] = c.reason
        items.append(d)
    for v in EmployeeVacation.query.order_by(EmployeeVacation.id.desc()).limit(limit).all():
        d = _label("vacation", EmployeeVacation, v)
        d["status"] = v.status
        d["keep_bed_reserved"] = v.keep_bed_reserved
        items.append(d)
    for r in LandlordRenewal.query.order_by(LandlordRenewal.id.desc()).limit(limit).all():
        d = _label("renewal", LandlordRenewal, r)
        items.append(d)
    for m in MaintenanceRecord.query.order_by(MaintenanceRecord.id.desc()).limit(limit).all():
        d = _label("maintenance", MaintenanceRecord, m)
        d["entity_type"] = m.entity_type
        d["status"] = m.status
        items.append(d)

    items.sort(key=lambda x: x["created_at"] or "", reverse=True)
    return items[:limit]


def alerts() -> dict:
    """Group alerts by severity for the alert center / notification bell."""
    today = date.today()
    active_agreements = (
        PropertyAgreement.query
        .filter(PropertyAgreement.is_active.is_(True))
        .all()
    )
    expired = []
    soon_7 = []
    soon_30 = []
    soon_90 = []
    for ag in active_agreements:
        bucket = agreement_bucket(ag.expiry_date, today)
        days_left = (ag.expiry_date - today).days
        prop = ag.property
        entry = {
            "agreement_id": ag.id,
            "landlord_id": ag.landlord_id,
            "landlord_name": ag.landlord.name if ag.landlord else None,
            "property_id": prop.id if prop else None,
            "property_name": prop.name if prop else None,
            "expiry_date": ag.expiry_date.isoformat(),
            "days_left": days_left,
            "bucket": bucket,
        }
        if bucket == "expired":
            expired.append(entry)
        elif bucket == "7":
            soon_7.append(entry)
        elif bucket in ("15", "30"):
            soon_30.append(entry)
        elif bucket in ("60", "90"):
            soon_90.append(entry)

    over_capacity = []
    for r in Room.query.all():
        beds = r.beds or []
        if len(beds) > (r.capacity or 0):
            over_capacity.append({
                "room_id": r.id, "property_id": r.property_id,
                "room_number": r.room_number, "bed_count": len(beds), "capacity": r.capacity,
            })

    unassigned_employees = (
        Employee.query
        .filter(Employee.accommodation_required.is_(True))
        .filter(Employee.current_bed_id.is_(None))
        .filter(Employee.status.in_(("active", "on_vacation")))
        .order_by(Employee.full_name.asc())
        .limit(50)
        .all()
    )

    maintenance_active = (
        MaintenanceRecord.query
        .filter_by(status="in_progress")
        .order_by(MaintenanceRecord.start_date.desc())
        .limit(50)
        .all()
    )

    return {
        "critical": {
            "expired_agreements": expired,
            "expiring_within_7_days": soon_7,
            "over_capacity_rooms": over_capacity,
        },
        "warning": {
            "expiring_within_30_days": soon_30,
            "unassigned_employees": [
                {"id": e.id, "code": e.code, "full_name": e.full_name,
                 "division": e.division.name if e.division else None}
                for e in unassigned_employees
            ],
        },
        "info": {
            "expiring_within_90_days": soon_90,
            "maintenance_in_progress": [
                {"id": m.id, "transaction_number": m.transaction_number,
                 "entity_type": m.entity_type, "entity_id": m.entity_id,
                 "start_date": m.start_date.isoformat() if m.start_date else None,
                 "expected_end_date": m.expected_end_date.isoformat() if m.expected_end_date else None,
                 "reason": m.reason}
                for m in maintenance_active
            ],
        },
        "counts": {
            "critical": len(expired) + len(soon_7) + len(over_capacity),
            "warning": len(soon_30) + len(unassigned_employees),
            "info": len(soon_90) + len(maintenance_active),
        },
        "generated_at": datetime.utcnow().isoformat(),
    }
