# backend/guards/signals.py
from django.db.models.signals import post_save
from django.dispatch import receiver
from django.utils import timezone
from django.conf import settings

from .models import PatrolCoordinate, GuardProfile

@receiver(post_save, sender=PatrolCoordinate)
def update_guard_profile_on_patrol(sender, instance, created, **kwargs):
    """
    Update GuardProfile.last_seen / last_lat / last_lng / status when a new PatrolCoordinate is created.
    Keeps the logic out of serializers/views and centralised here.
    """
    if not created:
        return

    guard = getattr(instance, "guard", None)
    if guard is None:
        return

    try:
        profile = guard.profile
    except GuardProfile.DoesNotExist:
        return

    # Use the patrol timestamp if present, otherwise now()
    ts = instance.timestamp or timezone.now()

    profile.last_seen = ts
    profile.last_lat = instance.lat
    profile.last_lng = instance.lng

    # Simple heuristic for status: mark on_patrol for a short window after report
    online_window_seconds = int(getattr(settings, "GUARD_ONLINE_WINDOW_SECONDS", 10 * 60))
    profile.status = "on_patrol"

    # Save only the fields we changed
    try:
        profile.save(update_fields=["last_seen", "last_lat", "last_lng", "status"])
    except Exception:
        # don't crash the request if profile save fails
        pass
