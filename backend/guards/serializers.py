# backend/guards/serializers.py
import datetime
from django.utils import timezone
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import serializers
import os


from .models import (
    GuardProfile,
    Premise,
    Shift,
    AttendanceRecord,
    PatrolCoordinate,
    Checkpoint,
    CheckpointLog,
)

User = get_user_model()


# ----------------- User -----------------
class UserSerializer(serializers.ModelSerializer):
    password = serializers.CharField(write_only=True, required=False, allow_blank=True)

    class Meta:
        model = User
        fields = ("id", "username", "first_name", "last_name", "email", "is_guard", "is_admin", "password")
        read_only_fields = ("id",)

    def create(self, validated_data):
        password = validated_data.pop("password", None)
        user = User(**validated_data)
        if password:
            user.set_password(password)
        else:
            user.set_unusable_password()
        user.save()
        return user

    def update(self, instance, validated_data):
        password = validated_data.pop("password", None)
        for attr, value in validated_data.items():
            setattr(instance, attr, value)
        if password:
            instance.set_password(password)
        instance.save()
        return instance


# ----------------- GuardProfile -----------------
class GuardProfileSerializer(serializers.ModelSerializer):
    user = UserSerializer(read_only=True)
    user_id = serializers.IntegerField(write_only=True, required=False)

    class Meta:
        model = GuardProfile
        fields = (
            "id",
            "user",
            "user_id",
            "skills",
            "experience_years",
            "phone",
            "qr_uuid",
            "qr_image",
            "max_consecutive_days",
            "last_seen",
            "last_lat",
            "last_lng",
            "status",
        )
        read_only_fields = ("qr_uuid", "qr_image", "last_seen", "last_lat", "last_lng", "status")

    def create(self, validated_data):
        user_id = validated_data.pop("user_id", None)
        if not user_id:
            raise serializers.ValidationError({"user_id": "user_id is required"})
        try:
            user = User.objects.get(pk=user_id)
        except User.DoesNotExist:
            raise serializers.ValidationError({"user_id": "user not found"})
        profile = GuardProfile.objects.create(user=user, **validated_data)
        return profile


# ----------------- Premise -----------------
class PremiseSerializer(serializers.ModelSerializer):
    class Meta:
        model = Premise
        fields = ("id", "name", "address", "required_skills", "uuid", "qr_image")
        read_only_fields = ("uuid", "qr_image")


# ----------------- Shift -----------------
class ShiftSerializer(serializers.ModelSerializer):
    premise = PremiseSerializer(read_only=True)
    premise_id = serializers.IntegerField(write_only=True, required=False)
    assigned_guard = UserSerializer(read_only=True)
    assigned_guard_id = serializers.IntegerField(write_only=True, required=False, allow_null=True)
    assigned_at = serializers.DateTimeField(read_only=True)

    class Meta:
        model = Shift
        fields = ("id", "premise", "premise_id", "date", "start_time", "end_time", "required_skills", "assigned_guard", "assigned_guard_id","assigned_at")
        read_only_fields = ("id","assigned_at")

    def create(self, validated_data):
        premise_id = validated_data.pop("premise_id", None)
        if premise_id is None:
            raise serializers.ValidationError({"premise_id": "premise_id is required"})
        try:
            premise = Premise.objects.get(pk=premise_id)
        except Premise.DoesNotExist:
            raise serializers.ValidationError({"premise_id": "premise not found"})
        assigned_guard_id = validated_data.pop("assigned_guard_id", None)
        shift = Shift.objects.create(premise=premise, **validated_data)
        if assigned_guard_id:
            try:
                shift.assigned_guard = User.objects.get(pk=assigned_guard_id)
                shift.save()
            except User.DoesNotExist:
                raise serializers.ValidationError({"assigned_guard_id": "user not found"})
        return shift

    def update(self, instance, validated_data):
        assigned_guard_id = validated_data.pop("assigned_guard_id", None)
        if assigned_guard_id is not None:
            try:
                instance.assigned_guard = User.objects.get(pk=assigned_guard_id)
            except User.DoesNotExist:
                raise serializers.ValidationError({"assigned_guard_id": "user not found"})
        return super().update(instance, validated_data)



class AttendanceCreateSerializer(serializers.Serializer):
    shift_id = serializers.IntegerField(required=False, allow_null=True)
    qr_payload = serializers.JSONField(required=False, allow_null=True)
    check_in_lat = serializers.FloatField(required=False, allow_null=True)
    check_in_lng = serializers.FloatField(required=False, allow_null=True)
    force = serializers.BooleanField(required=False, default=False)
    manual = serializers.BooleanField(required=False, default=False)

    def _make_aware(self, dt):
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    def _in_allowed_window(self, shift, now):
        start = datetime.datetime.combine(shift.date, shift.start_time)
        end = datetime.datetime.combine(shift.date, shift.end_time)
        if timezone.is_naive(start):
            start = timezone.make_aware(start, timezone.get_current_timezone())
        if timezone.is_naive(end):
            end = timezone.make_aware(end, timezone.get_current_timezone())
        if end <= start:
            end += datetime.timedelta(days=1)
        early = int(getattr(settings, "ATTENDANCE_ALLOWED_EARLY_MINUTES", 15))
        late = int(getattr(settings, "ATTENDANCE_ALLOWED_LATE_MINUTES", 60))
        window_start = start - datetime.timedelta(minutes=early)
        window_end = end + datetime.timedelta(minutes=late)
        return window_start <= now <= window_end, window_start, window_end

    def validate(self, data):
        # normalize
        qr = data.get("qr_payload")
        incoming_shift_id = data.get("shift_id")
        manual_flag = bool(data.get("manual", False))
        now = timezone.localtime(timezone.now())

        # Helper: try load shift by id if provided (and not null)
        shift = None
        if incoming_shift_id is not None:
            try:
                shift = Shift.objects.get(pk=int(incoming_shift_id))
            except (Shift.DoesNotExist, ValueError, TypeError):
                raise serializers.ValidationError({"shift_id": "Shift not found"})

        # If not by id, try to resolve from QR payload (if provided)
        if shift is None and isinstance(qr, dict) and qr:
            payload_id = qr.get("id")
            payload_uuid = qr.get("uuid")
            premise = None

            if payload_id is not None:
                try:
                    premise = Premise.objects.get(pk=int(payload_id))
                except (Premise.DoesNotExist, ValueError, TypeError):
                    raise serializers.ValidationError({"qr_payload": "QR premise id not found"})
            elif payload_uuid is not None:
                try:
                    premise = Premise.objects.get(uuid=str(payload_uuid))
                except Premise.DoesNotExist:
                    raise serializers.ValidationError({"qr_payload": "QR premise uuid not found"})
            # look for candidate shifts around now (today +/- 1)
            if premise:
                dates_to_check = [
                    now.date(),
                    (now - datetime.timedelta(days=1)).date(),
                    (now + datetime.timedelta(days=1)).date(),
                ]
                candidates = Shift.objects.filter(premise=premise, date__in=dates_to_check).order_by("date", "start_time")
                chosen = None
                for s in candidates:
                    ok, _, _ = self._in_allowed_window(s, now)
                    if ok:
                        chosen = s
                        break
                if chosen is None:
                    chosen = candidates.filter(date=now.date()).first() or (candidates.last() if candidates.exists() else None)
                if chosen:
                    shift = chosen
                    data["shift_id"] = shift.id

        # If still no shift and manual flag set, try to find an assigned shift for the user in window
        if shift is None and manual_flag:
            request = self.context.get("request")
            user = getattr(request, "user", None)
            if user and getattr(user, "is_authenticated", False):
                dates_to_check = [now.date(), (now - datetime.timedelta(days=1)).date(), (now + datetime.timedelta(days=1)).date()]
                qs = Shift.objects.filter(assigned_guard=user, date__in=dates_to_check).order_by("date", "start_time")
                chosen = None
                for s in qs:
                    ok, _, _ = self._in_allowed_window(s, now)
                    if ok:
                        chosen = s
                        break
                if chosen:
                    shift = chosen
                    data["shift_id"] = shift.id

        # If still no shift, fail with helpful message
        if shift is None:
            raise serializers.ValidationError({
                "shift_id": "Missing shift_id / could not resolve a shift (provide shift_id, qr_payload with premise, or manual:true for assigned shift)."
            })

        # Validate QR matches premise if both present
        premise = shift.premise
        if qr and premise:
            payload_id = qr.get("id")
            payload_uuid = qr.get("uuid")
            if payload_id is not None:
                try:
                    if int(payload_id) != premise.id:
                        raise serializers.ValidationError({"qr_payload": "QR does not match premise"})
                except (ValueError, TypeError):
                    raise serializers.ValidationError({"qr_payload": "Invalid qr id"})
            elif payload_uuid is not None:
                if str(payload_uuid) != str(premise.uuid):
                    raise serializers.ValidationError({"qr_payload": "QR uuid does not match premise"})

        # time window enforcement (unless allowed force)
        ok, window_start, window_end = self._in_allowed_window(shift, now)
        raw_force = data.get("force", False)
        force_flag = bool(raw_force) if isinstance(raw_force, (bool, int)) else (
            raw_force.lower() in ("1", "true", "yes") if isinstance(raw_force, str) else False
        )
        request = self.context.get("request")
        user = getattr(request, "user", None)
        allow_force_env = os.environ.get("ALLOW_FORCE_CHECKIN", "false").lower() in ("1", "true", "yes")
        allow_force_settings = bool(getattr(settings, "ATTENDANCE_ALLOW_FORCE_FOR_STAFF", False))
        user_can_force = bool(
            allow_force_env
            or allow_force_settings
            or (user and (user.is_staff or user.has_perm("guards.force_checkin")))
        )
        if not ok and not (force_flag and user_can_force):
            raise serializers.ValidationError({
                "detail": f"Check-in outside allowed window {window_start.isoformat()} - {window_end.isoformat()}",
                "shift_id": shift.id,
                "shift_date": shift.date.isoformat(),
                "shift_start": shift.start_time.isoformat(),
                "shift_end": shift.end_time.isoformat(),
            })

        # prevent duplicate check-in for same guard+shift
        if request and getattr(request, "user", None):
            if AttendanceRecord.objects.filter(shift=shift, guard=request.user).exists():
                raise serializers.ValidationError({"detail": "You have already checked in for this shift."})

        data["_resolved_shift"] = shift
        return data

    def create(self, validated_data):
        request = self.context.get("request")
        user = getattr(request, "user", None)
        shift = validated_data.pop("_resolved_shift")
        attendance = AttendanceRecord.objects.create(
            guard=user if user and getattr(user, "is_authenticated", False) else None,
            shift=shift,
            check_in_time=timezone.now(),
            check_in_lat=validated_data.get("check_in_lat"),
            check_in_lng=validated_data.get("check_in_lng"),
            qr_payload=validated_data.get("qr_payload"),
            status="ON_TIME",
        )
        # finalize status
        start_dt = datetime.datetime.combine(shift.date, shift.start_time)
        end_dt = datetime.datetime.combine(shift.date, shift.end_time)
        if timezone.is_naive(start_dt):
            start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
        if timezone.is_naive(end_dt):
            end_dt = timezone.make_aware(end_dt, timezone.get_current_timezone())
        if end_dt <= start_dt:
            end_dt += datetime.timedelta(days=1)
        now_local = timezone.localtime(timezone.now())
        attendance.status = "ON_TIME" if now_local <= end_dt else "LATE"
        attendance.save(update_fields=["status"])
        return attendance

    def update(self, instance, validated_data):
        for attr, value in validated_data.items():
            if not attr.startswith("_"):
                setattr(instance, attr, value)
        instance.save()
        return instance




class AttendanceSerializer(serializers.ModelSerializer):
    # Assumes UserSerializer and ShiftSerializer available in your module scope
    guard = UserSerializer(read_only=True)
    shift = ShiftSerializer(read_only=True)

    class Meta:
        model = AttendanceRecord
        fields = ("id", "guard", "shift", "check_in_time", "check_in_lat", "check_in_lng", "qr_payload", "status")



# ----------------- PatrolCoordinate -----------------
class PatrolCoordinateSerializer(serializers.ModelSerializer):
    guard = serializers.SerializerMethodField(read_only=True)
    guard_id = serializers.IntegerField(write_only=True, required=False)
    shift = ShiftSerializer(read_only=True)
    shift_id = serializers.IntegerField(write_only=True, required=False)
    timestamp = serializers.DateTimeField(required=False)

    class Meta:
        model = PatrolCoordinate
        fields = ("id", "guard", "guard_id", "shift", "shift_id", "timestamp", "lat", "lng", "accuracy")
        read_only_fields = ("id", "guard", "timestamp", "shift")

    def get_guard(self, obj):
        if obj.guard:
            return {"id": obj.guard.id, "username": obj.guard.username}
        return None

    def validate(self, data):
        lat = data.get("lat")
        lng = data.get("lng")
        if lat is None or lng is None:
            raise serializers.ValidationError({"lat_lng": "lat and lng required"})
        try:
            latf = float(lat)
            lngf = float(lng)
        except (ValueError, TypeError):
            raise serializers.ValidationError({"lat_lng": "lat and lng must be numeric"})
        if not (-90.0 <= latf <= 90.0) or not (-180.0 <= lngf <= 180.0):
            raise serializers.ValidationError({"lat_lng": "lat/lng out of range"})
        return data

    def create(self, validated_data):
        request = self.context.get("request")
        # resolve guard
        if request and getattr(request, "user", None) and request.user.is_authenticated:
            guard = request.user
        else:
            guard_id = validated_data.pop("guard_id", None)
            if not guard_id:
                raise serializers.ValidationError({"guard": "Authentication required or provide guard_id"})
            try:
                guard = User.objects.get(pk=guard_id)
            except User.DoesNotExist:
                raise serializers.ValidationError({"guard_id": "guard not found"})

        # resolve shift
        shift = validated_data.get("shift")
        if shift is None:
            shift_id = validated_data.pop("shift_id", None)
            if not shift_id:
                raise serializers.ValidationError({"shift": "shift or shift_id is required"})
            try:
                shift = Shift.objects.get(pk=int(shift_id))
            except Shift.DoesNotExist:
                raise serializers.ValidationError({"shift_id": "shift not found"})

        ts = validated_data.pop("timestamp", None)
        if ts is None:
            ts = timezone.now()
        elif timezone.is_naive(ts):
            ts = timezone.make_aware(ts, timezone.get_current_timezone())

        coord = PatrolCoordinate.objects.create(
            guard=guard,
            shift=shift,
            timestamp=ts,
            lat=validated_data["lat"],
            lng=validated_data["lng"],
            accuracy=validated_data.get("accuracy"),
        )
        # update guard profile last_seen/last_lat/last_lng & status quickly (best via signal but quick inline update is fine)
        try:
            profile = guard.profile
            profile.last_seen = coord.timestamp
            profile.last_lat = coord.lat
            profile.last_lng = coord.lng
            # heuristic: mark on_patrol if recent
            delta = timezone.now() - (profile.last_seen or timezone.now())
            if delta.total_seconds() < (getattr(settings, "GUARD_ONLINE_WINDOW_SECONDS", 10 * 60)):
                profile.status = "on_patrol"
            profile.save(update_fields=["last_seen", "last_lat", "last_lng", "status"])
        except Exception:
            # ignore profile update failures
            pass

        return coord


# ----------------- Active guard serializer (helper for dashboard) -----------------
class ActiveGuardSerializer(serializers.ModelSerializer):
    profile = GuardProfileSerializer(read_only=True)
    last_seen_age_seconds = serializers.SerializerMethodField()

    class Meta:
        model = User
        fields = ("id", "username", "profile", "last_seen_age_seconds")

    def get_last_seen_age_seconds(self, obj):
        p = getattr(obj, "profile", None)
        if p and p.last_seen:
            return int((timezone.now() - p.last_seen).total_seconds())
        return None
