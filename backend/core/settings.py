# backend/core/settings.py
import os
from pathlib import Path
from urllib.parse import urlparse

BASE_DIR = Path(__file__).resolve().parent.parent

# --- Environment variables (with safe fallbacks)
SECRET_KEY = os.environ.get("SECRET_KEY", "dev-secret-key")
DEBUG = os.environ.get("DEBUG", "true").lower() in ("1", "true", "t")
ALLOWED_HOSTS = [h.strip() for h in os.environ.get("ALLOWED_HOSTS", "localhost,127.0.0.1,0.0.0.0").split(",") if h.strip()]

# Custom User Model
AUTH_USER_MODEL = "guards.CustomUser"

# Media / Static
MEDIA_URL = "/media/"
MEDIA_ROOT = BASE_DIR / "media"
STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"
STATICFILES_DIRS = [BASE_DIR / "static"] if (BASE_DIR / "static").exists() else []

# --- App-specific runtime configuration
ATTENDANCE_ALLOWED_EARLY_MINUTES = int(os.environ.get("ATTENDANCE_ALLOWED_EARLY_MINUTES", 15))
ATTENDANCE_ALLOWED_LATE_MINUTES = int(os.environ.get("ATTENDANCE_ALLOWED_LATE_MINUTES", 60))
CHECKIN_EARLY_MINUTES = int(os.environ.get("CHECKIN_EARLY_MINUTES", ATTENDANCE_ALLOWED_EARLY_MINUTES))
CHECKIN_LATE_MINUTES = int(os.environ.get("CHECKIN_LATE_MINUTES", ATTENDANCE_ALLOWED_LATE_MINUTES))

MIN_PATROL_INTERVAL_SECONDS = int(os.environ.get("MIN_PATROL_INTERVAL_SECONDS", 30))
PATROL_MAX_POINTS_PER_REQUEST = int(os.environ.get("PATROL_MAX_POINTS_PER_REQUEST", 200))

ATTENDANCE_ALLOW_FORCE_FOR_STAFF = os.environ.get("ATTENDANCE_ALLOW_FORCE_FOR_STAFF", str(DEBUG)).lower() in ("1", "true", "t")

# --- Redis / Channels
# Default to the Docker service name "redis" when running inside docker-compose.
REDIS_URL = os.environ.get("REDIS_URL", "redis://redis:6379/1")
CHANNEL_LAYERS = {
    "default": {
        "BACKEND": "channels_redis.core.RedisChannelLayer",
        "CONFIG": {
            "hosts": [REDIS_URL],
        },
    },
}

# --- Installed Apps
INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",

    # Third-party
    "rest_framework",
    "corsheaders",
    "whitenoise.runserver_nostatic",  # helps static handling in dev

    # realtime
    "channels",

    # your app(s)
    "guards",
]

# --- Middleware (order matters)
MIDDLEWARE = [
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",  # serve static
    "corsheaders.middleware.CorsMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
]

# Whitenoise static file compression (good in prod)
STATICFILES_STORAGE = "whitenoise.storage.CompressedManifestStaticFilesStorage"

ROOT_URLCONF = "core.urls"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [BASE_DIR / "templates"],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.debug",
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    }
]

# ASGI / WSGI
WSGI_APPLICATION = "core.wsgi.application"
ASGI_APPLICATION = "core.asgi.application"

# --- Database configuration
# Accepts DATABASE_URL environment variable (postgres://user:pass@host:port/dbname)
DATABASE_URL = os.environ.get("DATABASE_URL", "postgres://guarduser:guardpass@db:5432/guardsdb")
parsed = urlparse(DATABASE_URL)

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": parsed.path.lstrip("/") or os.environ.get("DB_NAME", "guardsdb"),
        "USER": parsed.username or os.environ.get("DB_USER", "guarduser"),
        "PASSWORD": parsed.password or os.environ.get("DB_PASSWORD", "guardpass"),
        "HOST": parsed.hostname or os.environ.get("DB_HOST", "db"),
        "PORT": parsed.port or int(os.environ.get("DB_PORT", 5432)),
    }
}

# Password validation
AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator"},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

# Localization
LANGUAGE_CODE = "en-us"
TIME_ZONE = os.environ.get("TIME_ZONE", "Africa/Harare")
USE_I18N = True
USE_TZ = True

# CORS - open in dev, tighten in production
CORS_ALLOW_ALL_ORIGINS = os.environ.get("CORS_ALLOW_ALL_ORIGINS", "true").lower() in ("1", "true", "t")

# DRF + Simple JWT
# near existing REST_FRAMEWORK in backend/core/settings.py
from datetime import timedelta

REST_FRAMEWORK = {
    "DEFAULT_AUTHENTICATION_CLASSES": (
        "rest_framework_simplejwt.authentication.JWTAuthentication",
    ),
    "DEFAULT_PERMISSION_CLASSES": (
        "rest_framework.permissions.IsAuthenticatedOrReadOnly",
    ),
}

# Simple JWT: increase access lifetime and provide refresh token.
# Adjust ACCESS_TOKEN_LIFETIME to taste (hours) — 8 hours is a reasonable default for mobile/web apps.
SIMPLE_JWT = {
    "ACCESS_TOKEN_LIFETIME": timedelta(hours=8),        # change to e.g. timedelta(days=1) if you want even longer
    "REFRESH_TOKEN_LIFETIME": timedelta(days=14),
    "ROTATE_REFRESH_TOKENS": True,
    "BLACKLIST_AFTER_ROTATION": False,
    "ALGORITHM": "HS256",
    "AUTH_HEADER_TYPES": ("Bearer",),
    "AUTH_TOKEN_CLASSES": ("rest_framework_simplejwt.tokens.AccessToken",),
}

# If some parts of your app still use session cookies (or for admin use), make session long-lived:
SESSION_COOKIE_AGE = 60 * 60 * 24 * 14   # 14 days
SESSION_SAVE_EVERY_REQUEST = True       # optionally extend session expiry on activity




# Default primary key
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

# Logging - helpful when debugging migrations in containers
LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "formatters": {
        "verbose": {"format": "[{levelname}] {asctime} {name} {message}", "style": "{"},
    },
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "verbose"},
    },
    "root": {"handlers": ["console"], "level": os.environ.get("DJANGO_LOG_LEVEL", "INFO")},
}

# Security headers you may set in production (example)
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https") if os.environ.get("USE_X_FORWARDED_PROTO", "false").lower() in ("1", "true", "t") else None
