# backend/guards/views.py
import json
from io import BytesIO
from datetime import datetime, timedelta

from django.utils import timezone
from django.http import HttpResponse
from django.conf import settings
from django.shortcuts import get_object_or_404

from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response
from rest_framework.views import APIView
from rest_framework.exceptions import ValidationError
from rest_framework.permissions import IsAuthenticated, AllowAny
from rest_framework_simplejwt.tokens import RefreshToken

from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils.dateparse import parse_date, parse_datetime

from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .serializers import AttendanceCreateSerializer, AttendanceSerializer
from .models import AttendanceRecord, Shift


from .models import GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate, Checkpoint, CheckpointLog
from .serializers import (
    UserSerializer,
    GuardProfileSerializer,
    PremiseSerializer,
    ShiftSerializer,
    AttendanceCreateSerializer,
    AttendanceSerializer,
    PatrolCoordinateSerializer,
    ActiveGuardSerializer,
)

import qrcode

User = get_user_model()


# ---------- User / Register ----------
class RegisterView(APIView):
    permission_classes = [AllowAny]

    def post(self, request):
        ser = UserSerializer(data=request.data)
        ser.is_valid(raise_exception=True)
        user = ser.save()
        refresh = RefreshToken.for_user(user)
        out = UserSerializer(user, context={"request": request}).data
        out.update({"access": str(refresh.access_token), "refresh": str(refresh)})
        return Response(out, status=status.HTTP_201_CREATED)


class UserViewSet(viewsets.ModelViewSet):
    queryset = User.objects.all().order_by("id")
    serializer_class = UserSerializer
    permission_classes = [AllowAny]

    @action(detail=False, methods=["get"], permission_classes=[IsAuthenticated])
    def me(self, request):
        ser = UserSerializer(request.user, context={"request": request})
        return Response(ser.data)


# ---------- GuardProfile & Premise ----------
class GuardProfileViewSet(viewsets.ModelViewSet):
    queryset = GuardProfile.objects.select_related("user").all()
    serializer_class = GuardProfileSerializer
    permission_classes = [AllowAny]


class PremiseViewSet(viewsets.ModelViewSet):
    queryset = Premise.objects.all()
    serializer_class = PremiseSerializer
    permission_classes = [AllowAny]


class PremiseQRView(APIView):
    permission_classes = [AllowAny]

    def get(self, request, pk):
        premise = get_object_or_404(Premise, pk=pk)
        if premise.qr_image:
            with premise.qr_image.open("rb") as f:
                data = f.read()
            return HttpResponse(data, content_type="image/png")
        payload = premise.qr_payload()
        data_str = json.dumps(payload)
        img = qrcode.make(data_str)
        buffer = BytesIO()
        img.save(buffer, format="PNG")
        buffer.seek(0)
        return HttpResponse(buffer.getvalue(), content_type="image/png")


# ---------- Shift viewset ----------
class ShiftViewSet(viewsets.ModelViewSet):
    queryset = Shift.objects.select_related("premise", "assigned_guard").all()
    serializer_class = ShiftSerializer
    permission_classes = [AllowAny]

    @action(detail=True, methods=["post"], url_path="assign", permission_classes=[AllowAny])
    def assign(self, request, pk=None):
        shift = self.get_object()
        guard_id = request.data.get("guard_id")
        if not guard_id:
            return Response({"detail": "guard_id required"}, status=status.HTTP_400_BAD_REQUEST)
        guard = get_object_or_404(User, pk=guard_id)
        shift.assigned_guard = guard
        shift.save()
        return Response(ShiftSerializer(shift, context={"request": request}).data)

    @action(detail=True, methods=["get"], url_path="patrols", permission_classes=[IsAuthenticated])
    def patrols(self, request, pk=None):
        shift = get_object_or_404(Shift, pk=pk)
        qs = PatrolCoordinate.objects.filter(shift=shift).order_by("timestamp")

        qfrom = request.query_params.get("from")
        qto = request.query_params.get("to")
        max_allowed = int(getattr(settings, "PATROL_MAX_POINTS_PER_REQUEST", 200))
        try:
            limit = int(request.query_params.get("limit", max_allowed))
        except (ValueError, TypeError):
            limit = max_allowed

        if qfrom:
            dt = parse_datetime(qfrom) or None
            if dt is None:
                parsed = parse_date(qfrom)
                if parsed:
                    dt = timezone.make_aware(datetime.combine(parsed, datetime.min.time()), timezone.get_current_timezone())
            if dt is None:
                return Response({"detail": "Invalid from datetime (use ISO)."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            qs = qs.filter(timestamp__gte=dt)

        if qto:
            dt = parse_datetime(qto) or None
            if dt is None:
                parsed = parse_date(qto)
                if parsed:
                    dt = timezone.make_aware(datetime.combine(parsed, datetime.max.time()), timezone.get_current_timezone())
            if dt is None:
                return Response({"detail": "Invalid to datetime (use ISO)."}, status=status.HTTP_400_BAD_REQUEST)
            if timezone.is_naive(dt):
                dt = timezone.make_aware(dt, timezone.get_current_timezone())
            qs = qs.filter(timestamp__lte=dt)

        limit = max(1, min(limit, max_allowed))
        qs = qs[:limit]
        ser = PatrolCoordinateSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)


# ---------- Attendance ----------
class AttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def _parse_qr_payload(self, raw):
        if raw is None:
            raise ValidationError({"qr_payload": "This field is required."})
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                try:
                    return json.loads(raw.replace("'", '"'))
                except Exception:
                    raise ValidationError({"qr_payload": "Invalid JSON for qr_payload."})
        raise ValidationError({"qr_payload": "Invalid qr_payload type."})

    def _make_aware(self, dt):
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    def get(self, request):
        date_q = request.query_params.get("date", "today")
        if date_q == "today":
            d = timezone.localdate()
        else:
            parsed = parse_date(date_q)
            if not parsed:
                return Response({"detail": "invalid date format, use YYYY-MM-DD or 'today'."}, status=status.HTTP_400_BAD_REQUEST)
            d = parsed

        qs = AttendanceRecord.objects.filter(check_in_time__date=d).select_related("guard", "shift").order_by("-check_in_time")
        ser = AttendanceSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)

    def post(self, request):
        data = request.data.copy()
        try:
            data["qr_payload"] = self._parse_qr_payload(data.get("qr_payload"))
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"detail": "Invalid qr_payload"}, status=status.HTTP_400_BAD_REQUEST)

        serializer = AttendanceCreateSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        attendance = serializer.create(serializer.validated_data)
        out = AttendanceSerializer(attendance, context={"request": request}).data
        return Response(out, status=status.HTTP_201_CREATED)


# ---------- Patrol endpoints ----------
class PatrolViewSet(viewsets.ModelViewSet):
    serializer_class = PatrolCoordinateSerializer
    permission_classes = [IsAuthenticated]

    def get_queryset(self):
        return PatrolCoordinate.objects.select_related("guard", "shift").exclude(guard__isnull=True).exclude(shift__isnull=True).exclude(lat__isnull=True).exclude(lng__isnull=True)

    def list(self, request, *args, **kwargs):
        qs = self.get_queryset()
        shift_id_raw = request.query_params.get("shift_id")
        if shift_id_raw:
            try:
                qs = qs.filter(shift_id=int(shift_id_raw))
            except (ValueError, TypeError):
                return Response({"detail": "Invalid shift_id"}, status=status.HTTP_400_BAD_REQUEST)
        qs = qs.order_by("timestamp")
        ser = self.get_serializer(qs, many=True)
        return Response(ser.data)

    def create(self, request, *args, **kwargs):
        if not request.user.is_authenticated:
            return Response({"detail": "Authentication required."}, status=status.HTTP_401_UNAUTHORIZED)

        data = request.data.copy()
        if "shift_id" in data and "shift" not in data:
            data["shift_id"] = data.get("shift_id")

        serializer = self.get_serializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        shift = serializer.validated_data.get("shift") or (Shift.objects.get(pk=serializer.validated_data.get("shift_id")) if serializer.validated_data.get("shift_id") else None)

        min_interval = int(getattr(settings, "MIN_PATROL_INTERVAL_SECONDS", 30))
        last = PatrolCoordinate.objects.filter(guard=request.user, shift=shift).order_by("-timestamp").first()
        if last:
            delta = timezone.now() - last.timestamp
            if delta.total_seconds() < min_interval:
                return Response({"detail": f"Too many points - minimum interval is {min_interval}s. Try again in {int(min_interval - delta.total_seconds())}s."}, status=status.HTTP_429_TOO_MANY_REQUESTS)

        obj = serializer.save(context={"request": request})
        return Response(self.get_serializer(obj).data, status=status.HTTP_201_CREATED)

    @action(detail=False, methods=["get"], url_path="latest")
    def latest(self, request):
        qs = self.get_queryset()
        shift_id_raw = request.query_params.get("shift_id")
        if shift_id_raw:
            try:
                qs = qs.filter(shift_id=int(shift_id_raw))
            except (ValueError, TypeError):
                return Response({"detail": "Invalid shift_id"}, status=status.HTTP_400_BAD_REQUEST)

        guard_ids = qs.order_by("guard_id").values_list("guard_id", flat=True).distinct()
        out_objs = []
        for gid in guard_ids:
            p = qs.filter(guard_id=gid).order_by("-timestamp").first()
            if p:
                out_objs.append(p)
        ser = self.get_serializer(out_objs, many=True)
        return Response(ser.data)


# ---------- Additional helper endpoints ----------
class ActiveGuardsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        cutoff = timezone.now() - timedelta(minutes=int(getattr(settings, "GUARD_ONLINE_WINDOW_MINUTES", 15)))
        guard_ids = PatrolCoordinate.objects.filter(timestamp__gte=cutoff).values_list("guard_id", flat=True).distinct()
        guards = User.objects.filter(id__in=guard_ids).select_related("profile")
        ser = ActiveGuardSerializer(guards, many=True, context={"request": request})
        return Response(ser.data)


class PatrolHeatmapView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        qs = PatrolCoordinate.objects.all().order_by("timestamp")
        shift_id_raw = request.query_params.get("shift_id")
        if shift_id_raw:
            try:
                qs = qs.filter(shift_id=int(shift_id_raw))
            except (ValueError, TypeError):
                return Response({"detail": "Invalid shift_id"}, status=status.HTTP_400_BAD_REQUEST)

        max_points = int(getattr(settings, "PATROL_HEATMAP_MAX_POINTS", 5000))
        qs = qs[:max_points]
        data = [{"lat": p.lat, "lng": p.lng, "timestamp": p.timestamp.isoformat(), "guard_id": p.guard_id} for p in qs]
        return Response(data)


# ---------- Dashboard ----------
class DashboardSummaryView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        active_shifts = Shift.objects.filter(date=today).count()
        guards_on_duty = AttendanceRecord.objects.filter(check_in_time__date=today).values("guard_id").distinct().count()
        on_time = AttendanceRecord.objects.filter(check_in_time__date=today, status="ON_TIME").count()
        total = AttendanceRecord.objects.filter(check_in_time__date=today).count()
        on_time_pct = int(on_time * 100 / total) if total else 0
        return Response({
            "active_shifts": active_shifts,
            "guards_on_duty": guards_on_duty,
            "on_time_pct": on_time_pct,
            "shifts_delta": 0,
            "guards_delta": 0,
            "on_time_delta": 0,
        })


class DashboardAnalyticsView(APIView):
    permission_classes = [IsAuthenticated]

    def get(self, request):
        today = timezone.localdate()
        start = today - timedelta(days=6)
        days = []
        for i in range(7):
            d = start + timedelta(days=i)
            on_time = AttendanceRecord.objects.filter(check_in_time__date=d, status="ON_TIME").count()
            late = AttendanceRecord.objects.filter(check_in_time__date=d, status="LATE").count()
            total = AttendanceRecord.objects.filter(check_in_time__date=d).count()
            absent = max(0, Shift.objects.filter(date=d).count() - total)
            days.append({"date": d.isoformat(), "on_time": on_time, "late": late, "absent": absent, "total": total})

        wl = AttendanceRecord.objects.filter(check_in_time__date__gte=start).values("guard__username").annotate(shifts=Count("id")).order_by("-shifts")[:50]
        return Response({"attendance_last_7_days": days, "workload": list(wl)})

# backend/guards/views.py
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework import status
from rest_framework.response import Response
from django.shortcuts import get_object_or_404
from django.db import transaction
from django.utils import timezone
from django.utils.dateparse import parse_date
from asgiref.sync import async_to_sync
from channels.layers import get_channel_layer

from .models import Premise, Shift, GuardProfile
from django.contrib.auth import get_user_model

User = get_user_model()


class AllocateView(APIView):
    """
    POST /api/allocate/
    body: { "premise_id": <int>, "date": "YYYY-MM-DD" | "today" (optional), "limit_per_shift": <int - optional> }
    Assigns best matching guards to unassigned shifts and notifies each assigned guard's websocket group:
       user_{guard_id}
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data or {}

        # premise_id validation
        premise_id = data.get("premise_id")
        if premise_id is None:
            return Response({"premise_id": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)
        try:
            premise_id = int(premise_id)
        except (ValueError, TypeError):
            return Response({"premise_id": "premise_id must be an integer."}, status=status.HTTP_400_BAD_REQUEST)

        # date handling: accept "today" or ISO YYYY-MM-DD; if absent use today
        date_q = data.get("date")
        if date_q in [None, "", "today"]:
            d = timezone.localdate()
        else:
            d = parse_date(str(date_q))
            if not d:
                return Response({"date": "Invalid date format, use YYYY-MM-DD or 'today'."}, status=status.HTTP_400_BAD_REQUEST)

        # limit per shift
        try:
            limit_per_shift = int(data.get("limit_per_shift", 1))
            if limit_per_shift < 1:
                limit_per_shift = 1
        except (ValueError, TypeError):
            limit_per_shift = 1

        premise = get_object_or_404(Premise, pk=premise_id)

        # find unassigned shifts for that premise on date
        shifts_qs = Shift.objects.filter(premise=premise, date=d, assigned_guard__isnull=True).order_by("start_time")
        if not shifts_qs.exists():
            return Response({"assignments": [], "count": 0, "detail": "No unassigned shifts found for that premise and date."})

        guard_profiles = list(GuardProfile.objects.select_related("user").all())

        def score_guard_for_skills(guard_prof, required_skills):
            req_set = {s.strip().lower() for s in (required_skills or "").split(",") if s.strip()}
            guard_set = {s.strip().lower() for s in (guard_prof.skills or "").split(",") if s.strip()}
            skill_matches = len(req_set & guard_set)
            return skill_matches * 10 + (guard_prof.experience_years or 0)

        def guard_has_conflict(guard_user, shift_to_assign):
            if not guard_user:
                return True
            conflicts = Shift.objects.filter(assigned_guard=guard_user, date=shift_to_assign.date).exclude(pk=shift_to_assign.pk)
            for s in conflicts:
                # overlapping check
                if not (s.end_time <= shift_to_assign.start_time or s.start_time >= shift_to_assign.end_time):
                    return True
            return False

        assignments = []
        assigned_guard_ids = set()

        channel_layer = get_channel_layer()
        # helper to send to per-user group: user_<id>
        def notify_user(guard_id, payload):
            try:
                async_to_sync(channel_layer.group_send)(f"user_{guard_id}", {
                    "type": "assignment.created",  # will call assignment_created handler on consumer
                    "assignment": payload,
                })
            except Exception:
                # don't break assignment if notification fails; log in real app
                pass

        # Wrap in transaction to avoid partial assignments in race conditions
        with transaction.atomic():
            for shift in shifts_qs:
                req_skills = shift.required_skills or ""
                candidates = []
                for gp in guard_profiles:
                    if gp.user_id in assigned_guard_ids:
                        continue
                    if getattr(gp.user, "is_staff", False):
                        continue
                    if guard_has_conflict(gp.user, shift):
                        continue
                    candidates.append((score_guard_for_skills(gp, req_skills), gp))

                candidates.sort(key=lambda x: x[0], reverse=True)

                if not candidates:
                    continue

                assigned_for_this_shift = 0
                for score_val, gp in candidates:
                    if assigned_for_this_shift >= limit_per_shift:
                        break
                    # double-check still unassigned via select_for_update
                    fresh = Shift.objects.select_for_update().get(pk=shift.pk)
                    if fresh.assigned_guard is not None:
                        break
                    fresh.assigned_guard = gp.user
                    fresh.assigned_at = timezone.now()
                    fresh.save(update_fields=["assigned_guard", "assigned_at"])
                    assigned_guard_ids.add(gp.user_id)

                    assignment_payload = {
                        "shift_id": fresh.id,
                        "assigned_guard_id": gp.user.id,
                        "guard_username": gp.user.username,
                        "score": score_val,
                        "assigned_at": fresh.assigned_at.isoformat(),
                        "premise_id": premise.id,
                        "premise_name": premise.name,
                    }
                    assignments.append(assignment_payload)
                    assigned_for_this_shift += 1

                    # Notify the specific guard's websocket group (user_{id})
                    notify_user(gp.user.id, assignment_payload)

        return Response({"assignments": assignments, "count": len(assignments)})
        

class RecentAssignmentsView(APIView):
    """
    GET /api/assignments/recent/?since=<ISO datetime>&limit=<n>
    Returns recent assignments. Requires authentication.
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        since_q = request.query_params.get("since")
        try:
            limit = int(request.query_params.get("limit", 50))
        except (ValueError, TypeError):
            limit = 50
        qs = Shift.objects.filter(assigned_guard__isnull=False).order_by('-assigned_at')
        if since_q:
            try:
                from django.utils.dateparse import parse_datetime
                since_dt = parse_datetime(since_q)
                if since_dt:
                    qs = qs.filter(assigned_at__gte=since_dt)
            except Exception:
                pass
        qs = qs[:min(limit, 200)]
        out = []
        for s in qs:
            out.append({
                "shift_id": s.id,
                "premise": s.premise.name if s.premise else None,
                "assigned_guard_id": s.assigned_guard.id if s.assigned_guard else None,
                "guard_username": s.assigned_guard.username if s.assigned_guard else None,
                "assigned_at": s.assigned_at.isoformat() if s.assigned_at else None,
            })
        return Response({"assignments": out})



# put these imports near top of views.py (if not already present)
from rest_framework.exceptions import ValidationError
from django.utils.dateparse import parse_date

# ---- Unified AttendanceView (supports GET and POST) ----
class AttendanceView(APIView):
    permission_classes = [IsAuthenticated]

    def _parse_qr_payload(self, raw):
        if raw is None:
            raise ValidationError({"qr_payload": "This field is required."})
        if isinstance(raw, dict):
            return raw
        if isinstance(raw, str):
            try:
                return json.loads(raw)
            except Exception:
                try:
                    return json.loads(raw.replace("'", '"'))
                except Exception:
                    raise ValidationError({"qr_payload": "Invalid JSON for qr_payload."})
        raise ValidationError({"qr_payload": "Invalid qr_payload type."})

    def _make_aware(self, dt):
        if timezone.is_naive(dt):
            return timezone.make_aware(dt, timezone.get_current_timezone())
        return dt

    def get(self, request):
        """
        GET /api/attendance/?date=YYYY-MM-DD or date=today
        Returns list of attendance records for given date (default: today).
        """
        date_q = request.query_params.get("date", "today")
        if date_q == "today":
            d = timezone.localdate()
        else:
            parsed = parse_date(date_q)
            if not parsed:
                return Response(
                    {"detail": "invalid date format, use YYYY-MM-DD or 'today'."},
                    status=status.HTTP_400_BAD_REQUEST,
                )
            d = parsed

        qs = AttendanceRecord.objects.filter(check_in_time__date=d).select_related("guard", "shift").order_by("-check_in_time")
        ser = AttendanceSerializer(qs, many=True, context={"request": request})
        return Response(ser.data)

    def post(self, request):
        """
        POST /api/attendance/
        Body: { "shift_id": <int>, "qr_payload": <object|stringified-json>, "check_in_lat": <float>, "check_in_lng": <float>, "force": <bool> }
        """
        data = request.data.copy()

        # parse qr payload
        try:
            data["qr_payload"] = self._parse_qr_payload(data.get("qr_payload"))
        except ValidationError as e:
            return Response(e.detail, status=status.HTTP_400_BAD_REQUEST)
        except Exception:
            return Response({"detail": "Invalid qr_payload"}, status=status.HTTP_400_BAD_REQUEST)

        # run serializer validation
        serializer = AttendanceCreateSerializer(data=data, context={"request": request})
        serializer.is_valid(raise_exception=True)

        # resolved shift may be provided by serializer (if you put it there), otherwise fetch
        shift = serializer.validated_data.get("shift")
        if shift is None:
            shift_id = serializer.validated_data.get("shift_id") or data.get("shift_id")
            if not shift_id:
                return Response({"shift_id": "This field is required."}, status=status.HTTP_400_BAD_REQUEST)
            shift = get_object_or_404(Shift, pk=shift_id)

        # ensure qr payload contains matching uuid or id for the premise
        qr_payload = data.get("qr_payload") or {}
        # Accept either 'uuid' or numeric 'id' depending on your QR encoding:
        qr_uuid = qr_payload.get("uuid")
        qr_id = qr_payload.get("id")
        premise = shift.premise
        if qr_uuid is not None:
            if str(premise.uuid) != str(qr_uuid):
                return Response({"detail": "QR payload does not match premise for this shift."}, status=status.HTTP_400_BAD_REQUEST)
        elif qr_id is not None:
            try:
                if int(qr_id) != int(premise.id):
                    return Response({"detail": "QR payload does not match premise for this shift."}, status=status.HTTP_400_BAD_REQUEST)
            except Exception:
                return Response({"qr_payload": "Invalid id in qr_payload."}, status=status.HTTP_400_BAD_REQUEST)
        else:
            return Response({"qr_payload": "Missing 'uuid' or 'id' in qr_payload."}, status=status.HTTP_400_BAD_REQUEST)

        # time window checks
        start_dt = self._make_aware(datetime.combine(shift.date, shift.start_time))
        end_dt = self._make_aware(datetime.combine(shift.date, shift.end_time))

        early_minutes = int(getattr(settings, "ATTENDANCE_ALLOWED_EARLY_MINUTES", 15))
        late_minutes = int(getattr(settings, "ATTENDANCE_ALLOWED_LATE_MINUTES", 60))
        allowed_start = start_dt - timedelta(minutes=early_minutes)
        allowed_end = end_dt + timedelta(minutes=late_minutes)

        now = timezone.now()
        force_flag = data.get("force") in [True, "true", "1", "True"]
        staff_can_force = bool(getattr(settings, "ATTENDANCE_ALLOW_FORCE_FOR_STAFF", False))
        user = request.user

        if not (allowed_start <= now <= allowed_end):
            if not (staff_can_force and getattr(user, "is_staff", False) and force_flag):
                return Response({
                    "detail": [
                        f"Check-in not allowed: current time {now.isoformat()} outside allowed window "
                        f"{allowed_start.isoformat()} - {allowed_end.isoformat()}."
                    ]
                }, status=status.HTTP_400_BAD_REQUEST)

        # Only guards allowed (unless staff forced)
        if not getattr(user, "is_guard", False):
            if not (staff_can_force and getattr(user, "is_staff", False) and force_flag):
                return Response({"detail": "Only users with is_guard=True can check in."}, status=status.HTTP_403_FORBIDDEN)

        # optional: auto-assign guard to shift if unassigned and passing simple checks
        auto_assigned = False
        try:
            if shift.assigned_guard is None and getattr(user, "is_guard", False):
                try:
                    gp = user.profile
                except Exception:
                    gp = None

                required = {s.strip().lower() for s in (shift.required_skills or "").split(",") if s.strip()}
                guard_skills = {s.strip().lower() for s in ((gp.skills if gp else "") or "").split(",") if s.strip()}

                skills_ok = (len(required) == 0) or required.issubset(guard_skills)

                min_exp = int(getattr(settings, "ATTENDANCE_AUTO_ASSIGN_MIN_EXP", 0))
                exp_ok = True
                try:
                    exp_ok = (gp.experience_years >= min_exp) if gp and min_exp else True
                except Exception:
                    exp_ok = True

                if skills_ok and exp_ok:
                    shift.assigned_guard = user
                    shift.save(update_fields=["assigned_guard"])
                    auto_assigned = True
        except Exception:
            # don't block check-in on assignment failure
            auto_assigned = False

        # create attendance record via serializer.save
        try:
            # serializer.save may accept guard kwarg depending on serializer implementation
            attendance = serializer.save(guard=user)
        except TypeError:
            # fallback: call serializer.create
            attendance = serializer.create(serializer.validated_data)
            attendance.guard = user
            attendance.save()

        now_after_save = timezone.now()
        attendance.status = "ON_TIME" if now_after_save <= end_dt else "LATE"
        attendance.save()

        out = AttendanceSerializer(attendance, context={"request": request}).data
        out.update({"auto_assigned": auto_assigned})
        return Response(out, status=status.HTTP_201_CREATED)

# backend/guards/views.py  (append or insert)
from rest_framework.permissions import IsAuthenticated
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .models import AttendanceRecord
from .serializers import AttendanceSerializer

class GuardAttendanceHistoryView(APIView):
    """
    GET /api/attendance/history/?limit=20
    Returns the authenticated guard's recent attendance records (most recent first).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = request.query_params.get("limit", 20)
        try:
            limit = int(limit)
        except (ValueError, TypeError):
            limit = 20
        limit = max(1, min(limit, 200))
        qs = AttendanceRecord.objects.filter(guard=request.user).order_by("-check_in_time")[:limit]
        serializer = AttendanceSerializer(qs, many=True, context={"request": request})
        return Response(serializer.data, status=status.HTTP_200_OK)

class QRCheckInView(APIView):
    """
    POST /api/attendance/checkin/
    Body:
      {
        "shift_id": <int>,
        "qr_payload": { ... },          # expected JSON payload embedded in QR
        "check_in_lat": <float>,        # optional
        "check_in_lng": <float>,        # optional
        "force": <bool>                 # optional, staff override
      }

    Authentication:
      - Recommended: require authentication (IsAuthenticated) so the backend attributes the
        attendance to `request.user`. If you want public QR scans you could change to AllowAny
        and require a signed QR payload — but here we use IsAuthenticated for security.
    """
    permission_classes = [IsAuthenticated]

    def post(self, request):
        data = request.data or {}
        # set serializer context so validation can access request
        ser = AttendanceCreateSerializer(data=data, context={"request": request})
        if not ser.is_valid():
            return Response(ser.errors, status=status.HTTP_400_BAD_REQUEST)

        attendance = ser.create(ser.validated_data)
        out = AttendanceSerializer(attendance).data

        # notify user via channels: send to per-user group and optionally to dispatchers
        try:
            channel_layer = get_channel_layer()
            payload = {
                "type": "attendance.created",
                "attendance": out,
            }
            # notify the guard (user_{id})
            if attendance.guard_id:
                async_to_sync(channel_layer.group_send)(f"user_{attendance.guard_id}", {"type": "attendance.created", "attendance": out})
            # optionally notify a dispatchers group (if you use it)
            async_to_sync(channel_layer.group_send)("dispatchers", {"type": "attendance.created", "attendance": out})
        except Exception:
            # don't fail the request if notifications fail
            pass

        return Response(out, status=status.HTTP_201_CREATED)


class RecentGuardAttendanceView(APIView):
    """
    GET /api/attendance/my/?limit=50
    Returns recent check-ins for the authenticated guard (reverse chronological).
    """
    permission_classes = [IsAuthenticated]

    def get(self, request):
        limit = int(request.query_params.get("limit", 50))
        qs = AttendanceRecord.objects.filter(guard=request.user).order_by("-check_in_time")[:min(limit, 200)]
        ser = AttendanceSerializer(qs, many=True)
        return Response({"results": ser.data})
