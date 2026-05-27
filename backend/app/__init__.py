import os
from flask import Flask, jsonify
from flask_cors import CORS

from config import config_map
from .extensions import db, migrate, jwt
from .utils.responses import error_response


def create_app(config_name: str | None = None) -> Flask:
    env = config_name or os.getenv("FLASK_ENV", "development")
    app = Flask(__name__)
    app.config.from_object(config_map.get(env, config_map["default"]))

    os.makedirs(app.config["UPLOAD_FOLDER"], exist_ok=True)

    db.init_app(app)
    # Import models so Alembic autogenerate sees them
    from . import models  # noqa: F401
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}}, supports_credentials=True)

    from .routes.health import health_bp
    from .routes.auth import auth_bp
    from .routes.users import users_bp
    from .routes.roles import roles_bp
    from .routes.audit import audit_bp
    from .routes.divisions import divisions_bp
    from .routes.landlords import landlords_bp
    from .routes.properties import properties_bp
    from .routes.attachments import attachments_bp

    app.register_blueprint(health_bp, url_prefix="/api/v1")
    app.register_blueprint(auth_bp, url_prefix="/api/v1/auth")
    app.register_blueprint(users_bp, url_prefix="/api/v1/users")
    app.register_blueprint(roles_bp, url_prefix="/api/v1/roles")
    app.register_blueprint(audit_bp, url_prefix="/api/v1/audit")
    app.register_blueprint(divisions_bp, url_prefix="/api/v1/divisions")
    app.register_blueprint(landlords_bp, url_prefix="/api/v1/landlords")
    app.register_blueprint(properties_bp, url_prefix="/api/v1/properties")
    app.register_blueprint(attachments_bp, url_prefix="/api/v1/attachments")

    register_error_handlers(app)
    register_cli(app)

    @app.route("/")
    def index():
        return jsonify({"service": "PUG Accommodation Management API", "status": "ok"})

    return app


def register_error_handlers(app: Flask) -> None:
    @app.errorhandler(400)
    def bad_request(err):
        return error_response("Bad request", 400, str(getattr(err, "description", "")))

    @app.errorhandler(401)
    def unauthorized(err):
        return error_response("Unauthorized", 401)

    @app.errorhandler(403)
    def forbidden(err):
        return error_response("Forbidden", 403)

    @app.errorhandler(404)
    def not_found(err):
        return error_response("Not found", 404)

    @app.errorhandler(500)
    def server_error(err):
        return error_response("Internal server error", 500)


def register_cli(app: Flask) -> None:
    from .cli import register_commands
    register_commands(app)
