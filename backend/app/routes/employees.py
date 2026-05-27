from datetime import datetime
from flask import Blueprint, request, Response

from ..extensions import db
from ..models import Employee, Division, ImportBatch, ImportError as ImportErrorRow
from ..models.employee import EMPLOYEE_STATUSES, ACCOMMODATION_TYPES, GENDERS
from ..services import audit, codes, employee_import
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

employees_bp = Blueprint("employees", __name__)

EDITABLE = {
    "full_name", "qid_number", "passport_number", "visa_company",
    "division_id", "designation", "department", "nationality", "gender",
    "mobile_number", "joining_date", "accommodation_required",
    "accommodation_type", "status", "emergency_contact", "remarks",
}


def _validate(payload: dict) -> str | None:
    if "gender" in payload and payload["gender"] and payload["gender"] not in GENDERS:
        return f"gender must be one of {sorted(GENDERS)}"
    if "accommodation_type" in payload and payload["accommodation_type"] and payload["accommodation_type"] not in ACCOMMODATION_TYPES:
        return f"accommodation_type must be one of {sorted(ACCOMMODATION_TYPES)}"
    if "status" in payload and payload["status"] and payload["status"] not in EMPLOYEE_STATUSES:
        return f"status must be one of {sorted(EMPLOYEE_STATUSES)}"
    if "division_id" in payload and payload["division_id"]:
        if not Division.query.get(payload["division_id"]):
            return "division_id not found"
    return None


def _apply(emp: Employee, payload: dict) -> None:
    for k in EDITABLE:
        if k in payload:
            val = payload[k]
            if k == "joining_date" and val and not isinstance(val, datetime):
                if isinstance(val, str):
                    val = datetime.fromisoformat(val).date()
            setattr(emp, k, val)


@employees_bp.get("")
@require_permission("employee.view")
def list_employees():
    q = (request.args.get("q") or "").strip().lower()
    status = request.args.get("status")
    division_id = request.args.get("division_id", type=int)
    accommodation = request.args.get("accommodation")  # "yes" / "no"

    query = Employee.query
    if q:
        like = f"%{q}%"
        query = query.filter(
            db.or_(
                db.func.lower(Employee.code).like(like),
                db.func.lower(Employee.full_name).like(like),
                db.func.lower(Employee.qid_number).like(like),
                db.func.lower(Employee.passport_number).like(like),
                db.func.lower(Employee.mobile_number).like(like),
            )
        )
    if status:
        query = query.filter_by(status=status)
    if division_id:
        query = query.filter_by(division_id=division_id)
    if accommodation == "yes":
        query = query.filter_by(accommodation_required=True)
    elif accommodation == "no":
        query = query.filter_by(accommodation_required=False)

    rows = query.order_by(Employee.full_name.asc()).limit(500).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@employees_bp.get("/<int:emp_id>")
@require_permission("employee.view")
def get_employee(emp_id: int):
    return success_response(data=Employee.query.get_or_404(emp_id).to_dict())


@employees_bp.post("")
@require_permission("employee.create")
def create_employee():
    payload = request.get_json(silent=True) or {}
    if not (payload.get("full_name") or "").strip():
        return error_response("full_name is required", 400)
    err = _validate(payload)
    if err:
        return error_response(err, 400)

    qid = (payload.get("qid_number") or "").strip() or None
    passport = (payload.get("passport_number") or "").strip() or None
    if qid and Employee.query.filter_by(qid_number=qid).first():
        return error_response(f"QID {qid} already exists", 409)
    if passport and Employee.query.filter_by(passport_number=passport).first():
        return error_response(f"Passport {passport} already exists", 409)

    actor = current_user()
    code = (payload.get("code") or "").strip() or codes.next_code(Employee, codes.prefix_for("employee"), width=5)
    if Employee.query.filter_by(code=code).first():
        return error_response(f"Code {code} already exists", 409)

    emp = Employee(code=code, full_name=payload["full_name"].strip(),
                   created_by=actor.id, updated_by=actor.id)
    if qid:
        emp.qid_number = qid
    if passport:
        emp.passport_number = passport
    _apply(emp, payload)
    db.session.add(emp)
    db.session.flush()
    audit.record(user=actor, action="create", module="employee",
                 entity_type="employee", entity_id=emp.id, new_value=emp.to_dict())
    db.session.commit()
    return success_response(data=emp.to_dict(), message="Employee created", status=201)


@employees_bp.put("/<int:emp_id>")
@require_permission("employee.edit")
def update_employee(emp_id: int):
    emp = Employee.query.get_or_404(emp_id)
    payload = request.get_json(silent=True) or {}
    err = _validate(payload)
    if err:
        return error_response(err, 400)

    if "qid_number" in payload and payload["qid_number"]:
        new_qid = payload["qid_number"].strip()
        if new_qid != (emp.qid_number or "") and Employee.query.filter_by(qid_number=new_qid).first():
            return error_response(f"QID {new_qid} already exists", 409)
    if "passport_number" in payload and payload["passport_number"]:
        new_pp = payload["passport_number"].strip()
        if new_pp != (emp.passport_number or "") and Employee.query.filter_by(passport_number=new_pp).first():
            return error_response(f"Passport {new_pp} already exists", 409)

    actor = current_user()
    old = emp.to_dict()
    _apply(emp, payload)
    emp.updated_by = actor.id
    audit.record(user=actor, action="update", module="employee",
                 entity_type="employee", entity_id=emp.id,
                 old_value=old, new_value=emp.to_dict())
    db.session.commit()
    return success_response(data=emp.to_dict(), message="Employee updated")


@employees_bp.delete("/<int:emp_id>")
@require_permission("employee.edit")
def deactivate_employee(emp_id: int):
    emp = Employee.query.get_or_404(emp_id)
    actor = current_user()
    emp.status = "terminated"
    emp.updated_by = actor.id
    audit.record(user=actor, action="deactivate", module="employee",
                 entity_type="employee", entity_id=emp.id)
    db.session.commit()
    return success_response(message="Employee deactivated")


# ---------- Excel template & import ----------

@employees_bp.get("/template")
@require_permission("employee.import")
def download_template():
    data = employee_import.build_template_workbook()
    return Response(
        data,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": 'attachment; filename="employee_import_template.xlsx"'},
    )


@employees_bp.post("/import")
@require_permission("employee.import")
def import_employees():
    if "file" not in request.files:
        return error_response("file is required", 400)
    file = request.files["file"]
    if not file.filename:
        return error_response("file is required", 400)
    if not file.filename.lower().endswith((".xlsx", ".xlsm")):
        return error_response("Only .xlsx files are supported", 400)

    actor = current_user()
    try:
        batch, created = employee_import.import_workbook(
            file_bytes=file.read(), filename=file.filename, actor_id=actor.id,
        )
    except ValueError as exc:
        return error_response(str(exc), 400)

    audit.record(
        user=actor, action="import", module="employee",
        entity_type="import_batch", entity_id=batch.id,
        new_value={"total": batch.total_rows, "success": batch.success_rows, "errors": batch.error_rows},
        remarks=file.filename,
    )
    db.session.commit()

    return success_response(
        data={
            "batch": batch.to_dict(),
            "errors": [
                {"row_number": e.row_number, "errors": e.errors}
                for e in ImportErrorRow.query.filter_by(batch_id=batch.id).order_by(ImportErrorRow.row_number).all()
            ],
            "created_count": len(created),
        },
        message=f"Import {batch.status}",
        status=201 if batch.status == "completed" else 200,
    )


@employees_bp.get("/import-batches")
@require_permission("employee.import")
def list_import_batches():
    rows = (
        ImportBatch.query.filter_by(module="employee")
        .order_by(ImportBatch.id.desc())
        .limit(50)
        .all()
    )
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@employees_bp.get("/import-batches/<int:batch_id>")
@require_permission("employee.import")
def get_import_batch(batch_id: int):
    batch = ImportBatch.query.get_or_404(batch_id)
    errors = (
        ImportErrorRow.query.filter_by(batch_id=batch.id)
        .order_by(ImportErrorRow.row_number)
        .all()
    )
    data = batch.to_dict()
    data["errors"] = [
        {"row_number": e.row_number, "errors": e.errors, "raw_data": e.raw_data}
        for e in errors
    ]
    return success_response(data=data)
