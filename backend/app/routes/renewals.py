from flask import Blueprint, request

from ..extensions import db
from ..models import LandlordRenewal
from ..services import audit, renewals
from ..utils.auth import require_permission, current_user
from ..utils.responses import success_response, error_response

renewals_bp = Blueprint("renewals", __name__)


@renewals_bp.get("/renewals")
@require_permission("property.view")
def list_renewals():
    property_id = request.args.get("property_id", type=int)
    landlord_id = request.args.get("landlord_id", type=int)
    q = LandlordRenewal.query
    if property_id:
        q = q.filter_by(property_id=property_id)
    if landlord_id:
        q = q.filter_by(landlord_id=landlord_id)
    rows = q.order_by(LandlordRenewal.id.desc()).limit(200).all()
    return success_response(data=[r.to_dict() for r in rows], meta={"count": len(rows)})


@renewals_bp.post("/renewals")
@require_permission("renewal.create")
def create_renewal():
    payload = request.get_json(silent=True) or {}
    if not payload.get("property_id") or not payload.get("landlord_id"):
        return error_response("property_id and landlord_id are required", 400)

    actor = current_user()
    try:
        txn = renewals.post_renewal(
            property_id=int(payload["property_id"]),
            landlord_id=int(payload["landlord_id"]),
            new_start_date=payload.get("new_start_date"),
            new_expiry_date=payload.get("new_expiry_date"),
            new_monthly_rent=payload.get("new_monthly_rent"),
            agreement_number=payload.get("agreement_number"),
            payment_terms=payload.get("payment_terms"),
            notice_period=payload.get("notice_period"),
            reminder_days_before_expiry=payload.get("reminder_days_before_expiry") or 90,
            security_deposit=payload.get("security_deposit"),
            kahramaa_account=payload.get("kahramaa_account"),
            municipality_ref=payload.get("municipality_ref"),
            remarks=payload.get("remarks"),
            approved_by=payload.get("approved_by"),
            actor_id=actor.id,
        )
    except renewals.RenewalError as exc:
        db.session.rollback()
        return error_response(str(exc), 400)

    audit.record(user=actor, action="post", module="renewal",
                 entity_type="landlord_renewal", entity_id=txn.id,
                 new_value=txn.to_dict(), remarks=txn.transaction_number)
    db.session.commit()
    return success_response(data=txn.to_dict(), message="Renewal posted", status=201)
