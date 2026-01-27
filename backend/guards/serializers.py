# backend/guards/serializers.py
import json
from datetime import datetime, timedelta
from django.utils import timezone
from django.conf import settings
from django.contrib.auth import get_user_model
from rest_framework import serializers

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
        fields = ("id", "premise", "premise_id", "date", "start_time", "end_time", "required_skills", "assigned_guard", "assigned_guard_id", "assigned_at")
        read_only_fields = ("id", "assigned_at")

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


# ----------------- Attendance create/validate -----------------
class AttendanceCreateSerializer(serializers.Serializer):
    """
    Validates a check-in. Accepts:
      - shift_id (optional)
      - qr_payload: JSON object containing at least premise 'uuid' or 'id' or 'premise_id' (preferred)
      - check_in_lat / check_in_lng (optional)
      - force (optional bool) for staff override
      - client_timestamp (optional) and client_tz_offset_minutes (optional)
    If shift_id is missing we attempt to resolve a matching Shift from the qr_payload/premise.
    On success the validated_data will include '_resolved_shift' and '_client_timestamp_used'.
    """
    shift_id = serializers.IntegerField(required=False, allow_null=True)
    qr_payload = serializers.JSONField(required=False)
    check_in_lat = serializers.FloatField(required=False, allow_null=True)
    check_in_lng = serializers.FloatField(required=False, allow_null=True)
    force = serializers.BooleanField(required=False, default=False)

    client_timestamp = serializers.DateTimeField(required=False, allow_null=True)
    client_tz_offset_minutes = serializers.IntegerField(required=False, allow_null=True)

    def _parse_qr(self, raw):
        if raw is None:
            return None
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                try:
                    return json.loads(raw.replace("'", '"'))
                except Exception:
                    raise serializers.ValidationError({"qr_payload": "Invalid JSON for qr_payload."})
        raise serializers.ValidationError({"qr_payload": "Invalid qr_payload type."})

    def _resolve_shift_from_premise(self, premise, now, early, late, date_tolerance):
        """
        Return the best-matching Shift for a premise based on now and windows,
        or None if not found.
        """
        tz = timezone.get_current_timezone()
        local_date = now.astimezone(tz).date()
        candidate_shifts = Shift.objects.filter(premise=premise).order_by("date", "start_time")

        chosen = None
        windows = []
        for d_off in range(-date_tolerance, date_tolerance + 1):
            check_date = local_date + timedelta(days=d_off)
            day_shifts = candidate_shifts.filter(date=check_date)
            for s in day_shifts:
                # compute aware start/end
                start_dt = datetime.combine(s.date, s.start_time)
                end_dt = datetime.combine(s.date, s.end_time)
                if timezone.is_naive(start_dt):
                    start_dt = timezone.make_aware(start_dt, tz)
                if timezone.is_naive(end_dt):
                    end_dt = timezone.make_aware(end_dt, tz)
                if end_dt <= start_dt:
                    end_dt = end_dt + timedelta(days=1)
                allowed_start = start_dt - timedelta(minutes=early)
                allowed_end = end_dt + timedelta(minutes=late)
                windows.append((s, allowed_start, allowed_end))
                if allowed_start <= now <= allowed_end:
                    chosen = s
                    break
            if chosen:
                break

        if not chosen:
            # fallback: choose closest start time
            best = None
            best_diff = None
            for (s, allowed_start, allowed_end) in windows:
                start_dt = allowed_start + timedelta(minutes=early)
                diff = abs((start_dt - now).total_seconds())
                if best is None or diff < best_diff:
                    best = s
                    best_diff = diff
            chosen = best

        return chosen

    def validate(self, data):
        # Normalize qr_payload
        raw_qr = data.get("qr_payload")
        qr = None
        if raw_qr is not None:
            qr = self._parse_qr(raw_qr)
            data["qr_payload"] = qr

        # Compute the timestamp we will validate against (aware)
        client_ts = data.get("client_timestamp")
        client_offset = data.get("client_tz_offset_minutes")
        if client_ts:
            if timezone.is_naive(client_ts):
                if client_offset is not None:
                    try:
                        off = int(client_offset)
                        tzinfo = datetime.timezone(timedelta(minutes=off))
                        client_ts = client_ts.replace(tzinfo=tzinfo)
                    except Exception:
                        client_ts = timezone.make_aware(client_ts, timezone.get_current_timezone())
                else:
                    client_ts = timezone.make_aware(client_ts, timezone.get_current_timezone())
        else:
            client_ts = timezone.now()
        data["_client_timestamp_used"] = client_ts

        # Settings for windows
        early = int(getattr(settings, "ATTENDANCE_ALLOWED_EARLY_MINUTES", 15))
        late = int(getattr(settings, "ATTENDANCE_ALLOWED_LATE_MINUTES", 60))
        date_tolerance = int(getattr(settings, "ATTENDANCE_DATE_TOLERANCE_DAYS", 1))

        # 1) If shift_id provided, attempt to resolve it first.
        shift = None
        shift_id_raw = data.get("shift_id", None)
        if shift_id_raw is not None and str(shift_id_raw).strip() != "":
            try:
                shift_id_val = int(shift_id_raw)
            except (ValueError, TypeError):
                raise serializers.ValidationError({"shift_id": "shift_id must be an integer if provided."})
            try:
                shift = Shift.objects.select_related("premise").get(pk=shift_id_val)
                data["_resolved_shift"] = shift
                return data
            except Shift.DoesNotExist:
                # do not fail immediately if we can resolve from qr_payload below.
                data["_requested_shift_id"] = shift_id_val
                shift = None

        # 2) If no shift resolved yet, try to resolve from qr_payload (premise id/uuid)
        if qr is None:
            # clearer message: both missing
            raise serializers.ValidationError({
                "shift_id": [
                    "Missing shift_id and qr_payload. Provide a shift_id (int) or qr_payload containing premise id/uuid."
                ]
            })

        # Try to find premise by uuid or id or premise_id
        premise = None
        qr_uuid = qr.get("uuid") or qr.get("premise_uuid") or qr.get("u")
        qr_id = qr.get("id") or qr.get("premise_id") or qr.get("p")
        if qr_uuid:
            try:
                premise = Premise.objects.get(uuid=str(qr_uuid))
            except Premise.DoesNotExist:
                raise serializers.ValidationError({"qr_payload": "Premise with provided uuid not found."})
        elif qr_id:
            try:
                premise = Premise.objects.get(pk=int(qr_id))
            except Exception:
                raise serializers.ValidationError({"qr_payload": "Premise with provided id not found."})
        else:
            raise serializers.ValidationError({"qr_payload": "qr_payload must include premise uuid or id to resolve shift."})

        # Now try to pick best shift for this premise
        now = data["_client_timestamp_used"]
        chosen = self._resolve_shift_from_premise(premise, now, early, late, date_tolerance)

        if not chosen:
            # If client provided a shift_id that didn't match, surface both to help debugging
            if data.get("_requested_shift_id") is not None:
                raise serializers.ValidationError({
                    "shift_id": [
                        f"Shift id {data['_requested_shift_id']} not found. Also could not resolve a shift for premise id {premise.id} within the allowed time window."
                    ]
                })
            raise serializers.ValidationError({
                "shift_id": [
                    "Missing shift_id / could not resolve a shift (provide shift_id, qr_payload with premise, or ensure there is an active shift for that premise)."
                ]
            })

        data["_resolved_shift"] = chosen
        return data

    def create(self, validated_data):
        """
        Create AttendanceRecord using _resolved_shift and _client_timestamp_used.
        Guard is taken from request.user if authenticated.
        """
        request = self.context.get("request")
        user = getattr(request, "user", None) if request else None

        shift = validated_data.get("_resolved_shift")
        if not shift:
            raise serializers.ValidationError({"shift": "Shift must be resolved before creating attendance."})

        check_time = validated_data.get("_client_timestamp_used") or timezone.now()

        attendance = AttendanceRecord.objects.create(
            guard=(user if (user and getattr(user, "is_authenticated", False)) else None),
            shift=shift,
            check_in_time=check_time,
            check_in_lat=validated_data.get("check_in_lat"),
            check_in_lng=validated_data.get("check_in_lng"),
            qr_payload=validated_data.get("qr_payload") or {},
            status="ON_TIME",  # final status may be adjusted after save
        )
        return attendance


# ----------------- AttendanceSerializer -----------------
class AttendanceSerializer(serializers.ModelSerializer):
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
