from flask import Blueprint, request

from ..services import dashboard
from ..utils.auth import require_permission
from ..utils.responses import success_response

dashboard_bp = Blueprint("dashboard", __name__)


@dashboard_bp.get("/summary")
@require_permission("dashboard.view")
def summary():
    return success_response(data=dashboard.summary())


@dashboard_bp.get("/activity")
@require_permission("dashboard.view")
def activity():
    limit = min(request.args.get("limit", default=15, type=int), 100)
    return success_response(data=dashboard.recent_activity(limit=limit))


@dashboard_bp.get("/alerts")
@require_permission("dashboard.view")
def alerts():
    return success_response(data=dashboard.alerts())


@dashboard_bp.get("/charts/occupancy-by-property")
@require_permission("dashboard.view")
def occupancy_by_property():
    limit = min(request.args.get("limit", default=20, type=int), 100)
    return success_response(data=dashboard.occupancy_by_property(limit=limit))


@dashboard_bp.get("/charts/occupancy-by-division")
@require_permission("dashboard.view")
def occupancy_by_division():
    return success_response(data=dashboard.occupancy_by_division())


@dashboard_bp.get("/charts/monthly-movement")
@require_permission("dashboard.view")
def monthly_movement():
    months = min(request.args.get("months", default=6, type=int), 24)
    return success_response(data=dashboard.monthly_movement(months=months))
