# backend/guards/ws_auth.py
from urllib.parse import parse_qs
from channels.middleware import BaseMiddleware
from channels.db import database_sync_to_async
from django.contrib.auth import get_user_model
from django.contrib.auth.models import AnonymousUser
from rest_framework_simplejwt.tokens import UntypedToken, AccessToken
from rest_framework_simplejwt.exceptions import InvalidToken, TokenError
import logging

logger = logging.getLogger(__name__)
User = get_user_model()

@database_sync_to_async
def get_user_from_token(token):
    """
    Validate token and return User instance or AnonymousUser.
    Uses UntypedToken to validate signature/expiry and AccessToken to read user_id.
    """
    try:
        # Validate token signature & expiry
        UntypedToken(token)
        payload = AccessToken(token)
        user_id = payload.get("user_id") or payload.get("user", {}).get("id")
        if not user_id:
            return AnonymousUser()
        try:
            return User.objects.get(pk=int(user_id))
        except User.DoesNotExist:
            return AnonymousUser()
    except (TokenError, InvalidToken) as e:
        logger.debug("Invalid/expired WS token: %s", e)
        return AnonymousUser()
    except Exception as e:
        logger.exception("Unexpected error while validating WS token: %s", e)
        return AnonymousUser()


class JWTAuthMiddleware(BaseMiddleware):
    """
    Channels scope middleware that reads ?token=<jwt> or Authorization header and sets scope['user'].
    """

    async def __call__(self, scope, receive, send):
        token = None
        try:
            qs = scope.get("query_string", b"").decode()
            params = parse_qs(qs)
            tokens = params.get("token") or params.get("access_token") or params.get("jwt")
            if tokens:
                token = tokens[0]
            else:
                # try Authorization header in scope
                headers = dict((k.decode(), v.decode()) for k, v in scope.get("headers", []) if isinstance(k, bytes))
                auth_header = headers.get("authorization") or headers.get("Authorization")
                if auth_header and auth_header.lower().startswith("bearer "):
                    token = auth_header.split(" ", 1)[1].strip()
        except Exception:
            token = None

        if token:
            user = await get_user_from_token(token)
            scope["user"] = user
        else:
            scope["user"] = AnonymousUser()

        return await super().__call__(scope, receive, send)
