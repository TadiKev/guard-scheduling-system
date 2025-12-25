# backend/core/asgi.py
import os
from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "core.settings")

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter, URLRouter
from guards import routing as guards_routing
from guards.middleware import JWTAuthMiddleware

application = ProtocolTypeRouter({
    "http": django_asgi_app,
    # For websockets use JWTAuthMiddleware -> URLRouter
    "websocket": JWTAuthMiddleware(
        URLRouter(
            guards_routing.websocket_urlpatterns
        )
    ),
})
