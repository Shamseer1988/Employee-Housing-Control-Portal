import os
import secrets
import mimetypes
from datetime import datetime
from werkzeug.utils import secure_filename
from werkzeug.datastructures import FileStorage
from flask import current_app

from ..extensions import db
from ..models import Attachment

ALLOWED_EXTENSIONS = {
    "pdf", "png", "jpg", "jpeg", "gif", "webp", "svg",
    "doc", "docx", "xls", "xlsx", "csv", "txt",
}


def is_allowed(filename: str) -> bool:
    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    return ext in ALLOWED_EXTENSIONS


def store_file(
    *,
    file: FileStorage,
    entity_type: str,
    entity_id: int | str,
    category: str | None,
    actor_id: int | None,
    remarks: str | None = None,
) -> Attachment:
    if not file or not file.filename:
        raise ValueError("No file provided")
    if not is_allowed(file.filename):
        raise ValueError("File type not allowed")

    base_folder = current_app.config["UPLOAD_FOLDER"]
    sub = os.path.join(entity_type, str(entity_id), datetime.utcnow().strftime("%Y%m"))
    target_dir = os.path.join(base_folder, sub)
    os.makedirs(target_dir, exist_ok=True)

    original = secure_filename(file.filename) or "file"
    ext = original.rsplit(".", 1)[-1].lower() if "." in original else ""
    stored_name = f"{secrets.token_hex(8)}-{int(datetime.utcnow().timestamp())}.{ext}" if ext else secrets.token_hex(12)
    full_path = os.path.join(target_dir, stored_name)
    file.save(full_path)
    size = os.path.getsize(full_path)
    mime = file.mimetype or mimetypes.guess_type(original)[0]

    att = Attachment(
        entity_type=entity_type,
        entity_id=str(entity_id),
        category=category,
        original_name=original,
        stored_name=stored_name,
        mime_type=mime,
        size_bytes=size,
        path=os.path.join(sub, stored_name).replace(os.sep, "/"),
        remarks=remarks,
        created_by=actor_id,
        updated_by=actor_id,
    )
    db.session.add(att)
    db.session.flush()
    return att


def absolute_path(attachment: Attachment) -> str:
    return os.path.join(current_app.config["UPLOAD_FOLDER"], attachment.path)


def delete_file(attachment: Attachment) -> None:
    try:
        os.remove(absolute_path(attachment))
    except OSError:
        pass
    db.session.delete(attachment)
