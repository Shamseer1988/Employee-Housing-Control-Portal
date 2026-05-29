"""Server-Sent Events endpoints (Phase 8a).

GET /api/v1/events/stream  — long-lived text/event-stream the frontend
                              subscribes to. Auth via cookie (same as
                              every other route). Yields:
                                event: occupancy
                                data: {...json...}

POST /api/v1/events/publish — admin / test helper that publishes a
                              payload onto a channel. Useful for
                              smoke-testing the SSE pipeline end-to-end
                              without touching the assignment service.

In production this requires gunicorn's gthread or gevent worker class
so a long-lived connection doesn't block a sync worker. The compose
override is documented in DEPLOY notes (Phase 11).
"""
import json

from flask import Blueprint, Response, request, stream_with_context

from ..services import events
from ..utils.auth import login_required, current_user
from ..utils.responses import success_response, error_response

events_bp = Blueprint("events", __name__)

# Whitelist channels a client can subscribe to. Per-user notifications
# get the user's id resolved server-side, never trusted from the URL.
PUBLIC_CHANNELS = {"occupancy"}


@events_bp.get("/stream")
@login_required
def stream():
    requested = request.args.get("channel", "occupancy")
    user = current_user()
    if requested not in PUBLIC_CHANNELS and requested != "notification":
        return error_response("Unknown channel", 400)
    channel = (
        f"notification:{user.id}" if requested == "notification" else requested
    )

    @stream_with_context
    def gen():
        # Initial comment so the browser opens the connection cleanly
        # even if the first real event takes a while.
        yield ":ok\n\n"
        for body in events.subscribe(channel):
            if not body:
                # Keepalive ping every ~15s — comment lines are ignored
                # by the EventSource parser but keep the TCP socket
                # warm through middleboxes.
                yield ":keepalive\n\n"
                continue
            yield f"event: {requested}\ndata: {body}\n\n"

    resp = Response(gen(), mimetype="text/event-stream")
    resp.headers["Cache-Control"] = "no-cache"
    resp.headers["X-Accel-Buffering"] = "no"  # disable nginx buffering
    return resp


@events_bp.post("/publish")
@login_required
def publish_event():
    """Test / admin helper. Validates the channel and forwards to
    services.events.publish — used by integration tests + the smoke
    button on the events page."""
    payload = request.get_json(silent=True) or {}
    channel = payload.get("channel", "occupancy")
    data = payload.get("data") or {}
    user = current_user()
    if channel not in PUBLIC_CHANNELS and channel != "notification":
        return error_response("Unknown channel", 400)
    if channel == "notification":
        channel = f"notification:{user.id}"
    events.publish(channel, data)
    return success_response(message="published")
