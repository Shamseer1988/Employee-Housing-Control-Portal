"""Reusable schema bits for the Phase 4 apiflask migration.

Routes that have been migrated declare their request shape via
@bp.input(SomeIn) and document the response shape via
@bp.output(envelope(SomeOut)). Validation is enforced; serialization
isn't — views keep returning success_response(...) so the wire envelope
stays exactly as the frontend expects."""
from apiflask import Schema
from apiflask.fields import Boolean, Dict, Nested, Raw, String


def envelope(data_schema=None, *, many: bool = False, name: str | None = None) -> type[Schema]:
    """Build an OpenAPI envelope wrapping a per-resource data schema.

    The actual response is still constructed by success_response(); this
    schema only feeds the OpenAPI spec so generated clients know the
    public shape is {success, message, data, meta}."""
    if data_schema is None:
        data_field = Raw(allow_none=True)
    else:
        data_field = Nested(data_schema, many=many)

    cls_name = name or (f"{data_schema.__name__}Envelope"
                        if data_schema is not None else "EmptyEnvelope")
    return type(
        cls_name,
        (Schema,),
        {
            "success": Boolean(metadata={"description": "Always true on this status"}),
            "message": String(required=False),
            "data": data_field,
            "meta": Dict(required=False, allow_none=True),
        },
    )


class ErrorEnvelope(Schema):
    """Shape of every non-2xx response. Matches utils.responses.error_response."""
    success = Boolean()
    message = String()
    details = Raw(allow_none=True, required=False)
