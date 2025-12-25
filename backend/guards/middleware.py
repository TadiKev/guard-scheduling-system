# backend/guards/middleware.py
import jwt
from django.conf import settings
from django.contrib.auth.models import AnonymousUser
from channels.db import database_sync_to_async
from rest_framework_simplejwt.tokens import UntypedToken
from rest_framework_simplejwt.exceptions import TokenError, InvalidToken
from django.contrib.auth import get_user_model

User = get_user_model()

@database_sync_to_async
def get_user_by_id(user_id):
    try:
        return User.objects.get(pk=user_id)
    except User.DoesNotExist:
        return AnonymousUser()

class JWTAuthMiddleware:
    """
    ASGI middleware that reads ?token=<jwt> from the WebSocket URL,
    validates it using Simple JWT's UntypedToken (raises on invalid),
    decodes the token payload, finds the user and sets scope['user'].
    """

    def __init__(self, inner):
        self.inner = inner

    def __call__(self, scope):
        return JWTAuthMiddlewareInstance(scope, self.inner)

class JWTAuthMiddlewareInstance:
    def __init__(self, scope, inner):
        self.scope = dict(scope)  # copy
        self.inner = inner

    async def __call__(self, receive, send):
        # Default to anonymous
        self.scope["user"] = AnonymousUser()

        # Parse token from query_string
        query_string = self.scope.get("query_string", b"").decode()
        token = None
        if query_string:
            # simple parse, handles ?token=... or other params
            for pair in query_string.split("&"):
                if pair.startswith("token="):
                    token = pair.split("=", 1)[1]
                    break

        if token:
            try:
                # Validate token (raises on invalid/expired)
                UntypedToken(token)

                # Decode (we need payload to obtain user id)
                # Use PyJWT decode with SECRET_KEY (Simple JWT default HS256)
                # If you configured SIMPLE_JWT with different SIGNING_KEY or algorithm,
                # update accordingly.
                payload = jwt.decode(token, settings.SECRET_KEY, algorithms=["HS256"])

                user_id = payload.get("user_id") or payload.get("user") or payload.get("user_id")
                if user_id:
                    user = await get_user_by_id(int(user_id))
                    self.scope["user"] = user
            except (InvalidToken, TokenError, jwt.PyJWTError, Exception) as e:
                # Leave user as AnonymousUser on failure
                self.scope["user"] = AnonymousUser()

        inner = self.inner(self.scope)
        return await inner(receive, send)
