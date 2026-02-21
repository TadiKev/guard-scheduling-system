# backend/guards/management/commands/seed_presentation_data.py
import random
import math
import uuid
from io import BytesIO
from datetime import datetime, date, time, timedelta

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.core.files.base import ContentFile
from django.contrib.auth import get_user_model
from django.db import transaction

from guards.models import GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate

User = get_user_model()


def safe_time(h, m=0):
    return time(hour=h, minute=m)


def _normalize_skill_string(s):
    """
    Normalize skill input into a canonical comma-separated, lowercase, trimmed string.
    Accepts string or list/tuple. Returns '' when empty.
    """
    if not s:
        return ""
    if isinstance(s, (list, tuple)):
        toks = [str(x).strip().lower() for x in s if str(x).strip()]
        return ",".join(toks)
    # split on comma, strip each token, drop empties, lowercase
    return ",".join([t.strip().lower() for t in str(s).split(",") if t.strip()])


class Command(BaseCommand):
    help = "Seed presentation-ready data: guards, premises, shifts (past + future) and attendance. Use --wipe to remove existing records."

    def add_arguments(self, parser):
        parser.add_argument("--wipe", action="store_true", help="Delete existing guard/premise/shift/attendance/patrol data before seeding.")
        parser.add_argument("--guards", type=int, default=5, help="Number of guard users to create (default 5).")
        parser.add_argument("--days-past", type=int, default=60, help="Days in the past to seed attendance (default 60).")
        parser.add_argument("--days-future", type=int, default=60, help="Days in the future to create unassigned shifts (default 60).")
        parser.add_argument("--quiet", action="store_true", help="Less verbose output.")

    def handle(self, *args, **options):
        wipe = options["wipe"]
        num_guards = max(1, options["guards"])
        days_past = max(0, options["days_past"])
        days_future = max(0, options["days_future"])
        quiet = options["quiet"]

        tz = timezone.get_current_timezone()
        today = timezone.localdate()

        if not quiet:
            self.stdout.write(self.style.NOTICE(f"Seeding presentation data (guards={num_guards}, days_past={days_past}, days_future={days_future})"))

        if wipe:
            if not quiet:
                self.stdout.write(self.style.WARNING("Wiping existing GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate, and related users (non-staff)..."))
            # caution: only delete non-staff users created by this app
            with transaction.atomic():
                PatrolCoordinate.objects.all().delete()
                AttendanceRecord.objects.all().delete()
                Shift.objects.all().delete()
                GuardProfile.objects.all().delete()
                Premise.objects.all().delete()
                User.objects.filter(is_staff=False, is_superuser=False).delete()
            if not quiet:
                self.stdout.write(self.style.SUCCESS("Wipe complete."))

        # 1) Create sample premises (Zimbabwe context) — normalized required_skills
        premises_data = [
            ("Bulawayo Central Mall", "City Centre, Bulawayo", "retail,mall"),
            ("Main Mall", "Mutare CBD", "retail,mall"),
            ("Highfield Plaza", "Highfield, Harare", "retail,parking"),
            ("Gweru Industrial Park", "Gweru", "industrial,warehouse"),
            ("Killarney Shopping Centre", "Harare - Killarney", "retail,mall"),
            ("Victoria Falls Lodge", "Victoria Falls", "tourism,hotel"),
            ("Mutare Market", "Mutare Market", "market,crowd-control"),
            ("Northgate Center", "Harare Northgate", "retail,security"),
        ]

        premises = []
        for name, address, skills in premises_data:
            normalized = _normalize_skill_string(skills)
            p = Premise.objects.create(name=name, address=address, required_skills=normalized)
            # generate QR image via model method (if present)
            try:
                p.generate_qr_image(force=True)
                p.save(update_fields=["qr_image"])
            except Exception:
                try:
                    p.save()
                except Exception:
                    pass
            premises.append(p)

        if not quiet:
            self.stdout.write(self.style.SUCCESS(f"Created {len(premises)} premises."))

        # 2) Create guard users & profiles (ensure some guards have skills that match premises)
        sample_guards = [
            # username, first, last, skills, phone
            ("mfuneko", "Mfuneko", "Ncube", "retail,customer-service", "0771234567"),
            ("tendai", "Tendai", "Moyo", "industrial,patrol,warehouse", "0772345678"),
            ("zvikomborero", "Zvikomborero", "Chikafu", "hotel,tourism,customer-service", "0773456789"),
            ("rudo", "Rudo", "Gumbo", "market,crowd-control", "0774567890"),
            ("tatenda", "Tatenda", "Dube", "mall,first-aid,retail", "0775678901"),
            # extra guards to increase matching variety
            ("security1", "Sec", "One", "security,retail,patrol", "0776000001"),
            ("warehouse1", "Ware", "House", "industrial,warehouse,loading", "0776000002"),
        ]

        guards = []
        for i in range(num_guards):
            if i < len(sample_guards):
                username, first, last, skills, phone = sample_guards[i]
            else:
                username = f"guard{i+1:02d}"
                first = f"Guard{i+1:02d}"
                last = "Test"
                skills = random.choice(["retail,mall", "industrial,patrol", "hotel,tourism", "market", "crowd-control", "security"])
                phone = f"077{random.randint(1000000,9999999)}"

            password = "password"  # demo password
            user = User.objects.create(username=username, first_name=first, last_name=last, is_guard=True)
            user.set_password(password)
            user.save()

            normalized_skills = _normalize_skill_string(skills)
            profile = GuardProfile.objects.create(
                user=user,
                skills=normalized_skills,
                experience_years=random.randint(0, 8),
                phone=phone,
                max_consecutive_days=6,
            )
            try:
                profile.generate_qr_image(force=True)
                profile.save(update_fields=["qr_image"])
            except Exception:
                profile.save()
            guards.append((user, profile))

        if not quiet:
            self.stdout.write(self.style.SUCCESS(f"Created {len(guards)} guard users + profiles (demo password = 'password')."))

        # 3) Create shifts:
        # schedule pattern per day: morning (06-14), afternoon (14-22)
        shift_templates = [
            (6, 14),
            (14, 22),
        ]

        created_shifts = []
        # Past shifts (days_past days) -> create shifts and also attendance records (synthetic compliance)
        for d_offset in range(days_past, 0, -1):
            d = today - timedelta(days=d_offset)
            for premise in premises:
                for start_h, end_h in shift_templates:
                    if random.random() < 0.75:
                        s = Shift.objects.create(
                            premise=premise,
                            date=d,
                            start_time=safe_time(start_h, 0),
                            end_time=safe_time(end_h, 0),
                            required_skills=premise.required_skills,
                        )
                        created_shifts.append(s)

                        assigned = random.random() < 0.8
                        if assigned:
                            user, profile = random.choice(guards)
                            s.assigned_guard = user
                            s.assigned_at = timezone.make_aware(datetime.combine(d, safe_time(start_h, 0))) - timedelta(hours=1)
                            s.save(update_fields=["assigned_guard", "assigned_at"])

                            did_checkin = random.random() < 0.88
                            if did_checkin:
                                jitter = random.randint(-5, 60)
                                check_dt = datetime.combine(d, safe_time(start_h, 0)) + timedelta(minutes=jitter)
                                if timezone.is_naive(check_dt):
                                    check_dt = timezone.make_aware(check_dt, tz)
                                status = "ON_TIME" if jitter <= 10 else ("LATE" if jitter <= 60 else "LATE")
                                AttendanceRecord.objects.create(
                                    guard=user,
                                    shift=s,
                                    check_in_time=check_dt,
                                    check_in_lat=None,
                                    check_in_lng=None,
                                    qr_payload={"type": "premise", "id": premise.id, "uuid": str(premise.uuid)},
                                    status=status,
                                )
                        else:
                            if random.random() < 0.05:
                                user, profile = random.choice(guards)
                                jitter = random.randint(-10, 90)
                                check_dt = datetime.combine(d, safe_time(start_h, 0)) + timedelta(minutes=jitter)
                                if timezone.is_naive(check_dt):
                                    check_dt = timezone.make_aware(check_dt, tz)
                                status = "ON_TIME" if jitter <= 10 else "LATE"
                                AttendanceRecord.objects.create(
                                    guard=user,
                                    shift=s,
                                    check_in_time=check_dt,
                                    check_in_lat=None,
                                    check_in_lng=None,
                                    qr_payload={"type": "premise", "id": premise.id, "uuid": str(premise.uuid)},
                                    status=status,
                                )

        # Future shifts (next days_future days) -> create unassigned shifts for allocation testing
        future_shifts = []
        for d_offset in range(0, days_future):
            d = today + timedelta(days=d_offset)
            for premise in premises:
                for start_h, end_h in shift_templates:
                    if random.random() < 0.9:
                        s = Shift.objects.create(
                            premise=premise,
                            date=d,
                            start_time=safe_time(start_h, 0),
                            end_time=safe_time(end_h, 0),
                            required_skills=premise.required_skills,
                        )
                        future_shifts.append(s)

        if not quiet:
            self.stdout.write(self.style.SUCCESS(f"Created {len(created_shifts)} past shifts and {len(future_shifts)} future shifts."))

        # 4) create a few patrol coordinates for recent guard positions (so map isn't empty)
        now_dt = timezone.now()
        all_shifts = list(Shift.objects.all())
        for (user, profile) in guards:
            base_lat = -20.1503 + random.uniform(-0.02, 0.02)  # Bulawayo approx
            base_lng = 28.5846 + random.uniform(-0.02, 0.02)
            for j in range(3):
                ts = now_dt - timedelta(minutes=random.randint(0, 120))
                PatrolCoordinate.objects.create(
                    guard=user,
                    shift=random.choice(all_shifts) if all_shifts else None,
                    timestamp=ts,
                    lat=base_lat + random.uniform(-0.005, 0.005),
                    lng=base_lng + random.uniform(-0.005, 0.005),
                    accuracy=random.uniform(3, 30),
                )
            try:
                profile.last_seen = now_dt - timedelta(minutes=random.randint(0, 240))
                profile.last_lat = base_lat
                profile.last_lng = base_lng
                profile.status = "on_patrol"
                profile.save(update_fields=["last_seen", "last_lat", "last_lng", "status"])
            except Exception:
                pass

        # Summary print
        total_guards = User.objects.filter(is_guard=True).count()
        total_premises = Premise.objects.count()
        total_shifts = Shift.objects.count()
        total_attendance = AttendanceRecord.objects.count()

        if not quiet:
            self.stdout.write(self.style.SUCCESS(f"Seeding complete — guards: {total_guards}, premises: {total_premises}, shifts: {total_shifts}, attendance rows: {total_attendance}"))
            self.stdout.write(self.style.NOTICE("QR images generated for guards & premises (saved to MEDIA_ROOT)."))
            self.stdout.write(self.style.NOTICE("Use `--wipe` next time to remove these demo rows before reseeding."))

        return