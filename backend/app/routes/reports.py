from flask import Blueprint, Response, request

from ..services import reports as report_service
from ..utils.auth import require_permission
from ..utils.responses import success_response, error_response

reports_bp = Blueprint("reports", __name__)


@reports_bp.get("")
@require_permission("report.view")
def list_reports():
    return success_response(data=report_service.list_reports())


@reports_bp.get("/<slug>")
@require_permission("report.view")
def run_report(slug: str):
    filters = {k: v for k, v in request.args.items()}
    try:
        payload = report_service.build_report(slug, filters)
    except KeyError:
        return error_response("Report not found", 404)
    return success_response(data=payload, meta=payload.get("meta"))


@reports_bp.get("/<slug>/export")
@require_permission("report.export")
def export_report(slug: str):
    filters = {k: v for k, v in request.args.items()}
    try:
        payload = report_service.build_report(slug, filters)
    except KeyError:
        return error_response("Report not found", 404)
    info = report_service.REPORT_REGISTRY[slug]
    data = report_service.to_workbook(
        info["title"], payload.get("columns", []), payload.get("rows", []),
    )
    filename = f"{slug}.xlsx"
    return Response(
        data,
        mimetype="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
