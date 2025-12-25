# backend/guards/consumers.py
import logging
from channels.generic.websocket import AsyncJsonWebsocketConsumer

logger = logging.getLogger(__name__)

class AssignmentConsumer(AsyncJsonWebsocketConsumer):
    """
    WebSocket consumer that subscribes authenticated users to a per-user group:
      group name: user_{user.id}
    Sends assignment.created messages that the backend sends with group_send.
    """

    async def connect(self):
        user = self.scope.get("user", None)
        if not user or user.is_anonymous:
            logger.debug("WS connect rejected - anonymous user")
            # 4401 custom unauthorized close code (client can handle it)
            await self.close(code=4401)
            return

        self.user_group = f"user_{user.id}"
        try:
            await self.channel_layer.group_add(self.user_group, self.channel_name)
        except Exception as e:
            logger.exception("Failed to add websocket to group (channel layer error): %s", e)
            await self.close()
            return

        await self.accept()
        logger.debug("WS connected and joined group %s", self.user_group)

    async def disconnect(self, close_code):
        try:
            if hasattr(self, "user_group"):
                await self.channel_layer.group_discard(self.user_group, self.channel_name)
        except Exception:
            pass

    async def assignment_created(self, event):
        """
        Handler for group messages with type 'assignment.created'
        event is expected to contain an 'assignment' key.
        """
        payload = event.get("assignment") or event.get("data") or event
        try:
            await self.send_json({"type": "assignment.created", "payload": payload})
        except Exception as e:
            logger.exception("Failed to send assignment payload over WS: %s", e)

    async def receive_json(self, content):
        # Not used (server -> client only), but safe to ignore
        logger.debug("WS received json (ignored): %s", content)
