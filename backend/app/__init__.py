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
    migrate.init_app(app, db)
    jwt.init_app(app)
    CORS(app, resources={r"/api/*": {"origins": app.config["CORS_ORIGINS"]}}, supports_credentials=True)

    from .routes.health import health_bp
    app.register_blueprint(health_bp, url_prefix="/api/v1")

    register_error_handlers(app)

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
