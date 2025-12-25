# backend/guards/apps.py
from django.apps import AppConfig

class GuardsConfig(AppConfig):
    default_auto_field = "django.db.models.BigAutoField"
    name = "guards"

    def ready(self):
        # Import signals to register signal handlers
        try:
            from . import signals  # noqa: F401
        except Exception:
            # If something goes wrong during import, don't break the app startup;
            # the error will appear in logs when signals are missing.
            pass
