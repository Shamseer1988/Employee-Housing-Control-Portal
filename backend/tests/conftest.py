import os
import tempfile
import pytest

from app import create_app
from app.extensions import db
from app.cli import _seed_permissions, _seed_roles, _seed_super_user


@pytest.fixture()
def app(tmp_path):
    upload_dir = tmp_path / "uploads"
    upload_dir.mkdir()
    os.environ["UPLOAD_FOLDER"] = str(upload_dir)
    app = create_app("testing")
    app.config["UPLOAD_FOLDER"] = str(upload_dir)
    with app.app_context():
        db.create_all()
        perm_index = _seed_permissions()
        role_index = _seed_roles(perm_index)
        _seed_super_user(role_index)
        db.session.commit()
        yield app
        db.session.remove()
        db.drop_all()


@pytest.fixture()
def client(app):
    return app.test_client()


@pytest.fixture()
def admin_token(client):
    resp = client.post("/api/v1/auth/login", json={"username": "admin", "password": "ChangeMe123!"})
    assert resp.status_code == 200, resp.get_data(as_text=True)
    return resp.get_json()["data"]["access_token"]


@pytest.fixture()
def auth_headers(admin_token):
    return {"Authorization": f"Bearer {admin_token}"}
