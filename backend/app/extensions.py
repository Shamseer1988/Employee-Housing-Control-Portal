from flask_sqlalchemy import SQLAlchemy
from flask_migrate import Migrate
from flask_jwt_extended import JWTManager
from flask_limiter import Limiter
from flask_limiter.util import get_remote_address

db = SQLAlchemy()
migrate = Migrate()
jwt = JWTManager()

# Limiter is created without an app so route modules can decorate at
# import time (e.g. `@limiter.limit("10/minute")` on /auth/login).
# Storage URI + default limits are wired in create_app via init_app +
# Flask config keys (RATELIMIT_STORAGE_URI, RATELIMIT_DEFAULT).
limiter = Limiter(key_func=get_remote_address)
