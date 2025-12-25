# backend/guards/models.py
import uuid
import qrcode
from io import BytesIO
from django.core.files.base import ContentFile
from django.db import models
from django.contrib.auth.models import AbstractUser
from django.utils import timezone

# CustomUser
class CustomUser(AbstractUser):
    is_guard = models.BooleanField(default=False)
    is_admin = models.BooleanField(default=False)

    def __str__(self):
        return self.username


# GuardProfile with last_seen/status fields to support dashboard tiles
STATUS_CHOICES = [
    ("on_patrol", "On Patrol"),
    ("on_break", "On Break"),
    ("off_duty", "Off Duty"),
    ("on_site", "On Site"),
]

class GuardProfile(models.Model):
    user = models.OneToOneField("guards.CustomUser", on_delete=models.CASCADE, related_name="profile")
    skills = models.TextField(blank=True, help_text="Comma-separated tags")
    experience_years = models.IntegerField(default=0)
    phone = models.CharField(max_length=30, blank=True)
    qr_uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    qr_image = models.ImageField(upload_to="guard_qr/", blank=True, null=True)
    max_consecutive_days = models.IntegerField(default=6)

    # new fields to support live tiles & location
    last_seen = models.DateTimeField(null=True, blank=True)
    last_lat = models.FloatField(null=True, blank=True)
    last_lng = models.FloatField(null=True, blank=True)
    status = models.CharField(max_length=32, choices=STATUS_CHOICES, default="off_duty")

    def __str__(self):
        return f"Profile: {self.user.username}"

    def qr_payload(self):
        """Return JSON-serializable payload for guard QR."""
        return {"type": "guard", "id": self.user.id, "uuid": str(self.qr_uuid)}

    def generate_qr_image(self, force: bool = False):
        """Create QR PNG with payload and save to qr_image if not exists or force True."""
        if self.qr_image and not force:
            return
        payload = self.qr_payload()
        # safe JSON string
        data = json_payload = '{"type":"guard","id":%d,"uuid":"%s"}' % (self.user.id, str(self.qr_uuid))
        img = qrcode.make(json_payload)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        file_name = f"guard_{self.user.username}_{self.qr_uuid}.png"
        self.qr_image.save(file_name, ContentFile(buffer.getvalue()), save=False)

    def save(self, *args, **kwargs):
        # ensure we can generate QR using user.id; if the object is new -> save first to get profile.pk if needed
        new = self.pk is None
        if new:
            super().save(*args, **kwargs)
            if not self.qr_image:
                self.generate_qr_image(force=True)
            # save again to persist generated image
            super().save(update_fields=["qr_image"])
            return
        if not self.qr_image:
            self.generate_qr_image()
        super().save(*args, **kwargs)


# Premise with QR generation
class Premise(models.Model):
    name = models.CharField(max_length=255)
    address = models.TextField(blank=True)
    required_skills = models.TextField(blank=True, help_text="Comma-separated tags")
    uuid = models.UUIDField(default=uuid.uuid4, editable=False, unique=True)
    qr_image = models.ImageField(upload_to="premise_qr/", blank=True, null=True)

    def __str__(self):
        return self.name

    def qr_payload(self):
        """Return JSON-serializable payload for premise QR."""
        return {"type": "premise", "id": self.id, "uuid": str(self.uuid)}

    def generate_qr_image(self, force: bool = False):
        if self.qr_image and not force:
            return
        payload = self.qr_payload()
        # safe JSON
        data = '{"type":"premise","id":%d,"uuid":"%s"}' % (self.id, str(self.uuid))
        img = qrcode.make(data)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        safe_name = "".join(c if c.isalnum() else "_" for c in self.name)[:40]
        file_name = f"premise_{safe_name}_{self.uuid}.png"
        self.qr_image.save(file_name, ContentFile(buffer.getvalue()), save=False)

    def save(self, *args, **kwargs):
        created = self.pk is None
        if created:
            # first save to get id required for payload
            super().save(*args, **kwargs)
            if not self.qr_image:
                self.generate_qr_image(force=True)
            super().save(update_fields=["qr_image"])
            return
        if not self.qr_image:
            self.generate_qr_image()
        super().save(*args, **kwargs)


# Shift
class Shift(models.Model):
    premise = models.ForeignKey(Premise, on_delete=models.CASCADE, related_name="shifts")
    date = models.DateField()
    start_time = models.TimeField()
    end_time = models.TimeField()
    required_skills = models.TextField(blank=True, help_text="Comma-separated tags")
    assigned_guard = models.ForeignKey("guards.CustomUser", null=True, blank=True, on_delete=models.SET_NULL, related_name="shifts")
    assigned_at = models.DateTimeField(null=True, blank=True, help_text="Timestamp assigned_guard was set")

    class Meta:
        ordering = ["-date", "start_time"]

    def __str__(self):
        return f"{self.premise.name} {self.date} {self.start_time}-{self.end_time}"


# Attendance record
class AttendanceRecord(models.Model):
    STATUS_CHOICES = [
        ("ON_TIME", "On time"),
        ("LATE", "Late"),
        ("EARLY", "Early"),
        ("INVALID_QR", "Invalid QR"),
        ("MISSING", "Missing"),
    ]
    guard = models.ForeignKey("guards.CustomUser", on_delete=models.CASCADE, related_name="attendances")
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE, related_name="attendances")
    check_in_time = models.DateTimeField(default=timezone.now)
    check_in_lat = models.FloatField(null=True, blank=True)
    check_in_lng = models.FloatField(null=True, blank=True)
    qr_payload = models.JSONField(blank=True, null=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default="ON_TIME")

    def __str__(self):
        return f"{self.guard.username} @ {self.shift} {self.check_in_time}"


# Patrol coordinate
class PatrolCoordinate(models.Model):
    guard = models.ForeignKey("guards.CustomUser", on_delete=models.CASCADE, related_name="patrol_coords")
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE, related_name="patrol_coords")
    timestamp = models.DateTimeField(default=timezone.now)
    lat = models.FloatField()
    lng = models.FloatField()
    accuracy = models.FloatField(null=True, blank=True)  # optional

    def __str__(self):
        return f"{self.guard.username} {self.timestamp} ({self.lat},{self.lng})"


# Optional Checkpoint models to support 'checkpoints completed' counts in UI
class Checkpoint(models.Model):
    premise = models.ForeignKey(Premise, on_delete=models.CASCADE, related_name="checkpoints")
    code = models.CharField(max_length=64)
    lat = models.FloatField(null=True, blank=True)
    lng = models.FloatField(null=True, blank=True)
    description = models.CharField(max_length=255, blank=True)

    def __str__(self):
        return f"{self.premise.name} - {self.code}"


class CheckpointLog(models.Model):
    checkpoint = models.ForeignKey(Checkpoint, on_delete=models.CASCADE)
    shift = models.ForeignKey(Shift, on_delete=models.CASCADE)
    guard = models.ForeignKey("guards.CustomUser", on_delete=models.CASCADE)
    timestamp = models.DateTimeField(default=timezone.now)

    class Meta:
        unique_together = ("checkpoint", "shift", "guard")
