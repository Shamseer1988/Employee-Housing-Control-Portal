from flask import jsonify


def success_response(data=None, message: str = "Success", status: int = 200, meta: dict | None = None):
    payload = {"success": True, "message": message, "data": data}
    if meta is not None:
        payload["meta"] = meta
    return jsonify(payload), status


def error_response(message: str = "Error", status: int = 400, details: str | None = None):
    payload = {"success": False, "message": message}
    if details:
        payload["details"] = details
    return jsonify(payload), status
