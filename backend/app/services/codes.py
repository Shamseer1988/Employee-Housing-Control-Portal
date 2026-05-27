from sqlalchemy import func

from ..extensions import db


def next_code(model, prefix: str, width: int = 4) -> str:
    """Generate the next sequential code like 'PROP-0001' for a model with a `code` column."""
    last = (
        db.session.query(model.code)
        .filter(model.code.like(f"{prefix}-%"))
        .order_by(func.length(model.code).desc(), model.code.desc())
        .limit(1)
        .scalar()
    )
    if not last:
        seq = 1
    else:
        try:
            seq = int(last.split("-", 1)[1]) + 1
        except (IndexError, ValueError):
            seq = 1
    return f"{prefix}-{seq:0{width}d}"
