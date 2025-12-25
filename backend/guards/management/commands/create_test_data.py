# backend/guards/management/commands/create_test_data.py
import random
from datetime import datetime, time, timedelta
from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

from guards.models import GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate

User = get_user_model()

class Command(BaseCommand):
    help = "Create small set of test data: users, guard profiles, premises, shifts, patrols, attendance."

    def add_arguments(self, parser):
        parser.add_argument("--force", action="store_true", help="If set, delete existing demo objects created by this command and recreate.")

    def handle(self, *args, **options):
        force = options.get("force", False)
        created = {"users": 0, "profiles": 0, "premises": 0, "shifts": 0, "patrols": 0, "attendance": 0}

        if force:
            self.stdout.write("Force mode: removing demo objects (by username prefix 'demo_') ...")
            User.objects.filter(username__startswith="demo_").delete()
            Premise.objects.filter(name__startswith="Demo").delete()
            Shift.objects.filter(premise__name__startswith="Demo").delete()
            PatrolCoordinate.objects.filter(guard__username__startswith="demo_").delete()
            AttendanceRecord.objects.filter(guard__username__startswith="demo_").delete()

        # 1) create demo users (guards)
        self.stdout.write("Creating demo users & guard profiles ...")
        demo_guards = []
        for i in range(1, 6):
            username = f"demo_guard{i}"
            email = f"{username}@example.com"
            user, created_user = User.objects.get_or_create(username=username, defaults={"email": email})
            if created_user:
                user.set_password("password123")
                user.is_guard = True
                user.save()
                created["users"] += 1
            # ensure profile
            prof, created_profile = GuardProfile.objects.get_or_create(user=user, defaults={"phone": f"+263700000{i}"})
            if created_profile:
                created["profiles"] += 1
            demo_guards.append(user)

        # 2) create demo premises
        self.stdout.write("Creating demo premises ...")
        premises_data = [
            ("Demo Clinic", "Ruwa Clinic, Zimre Park"),
            ("Demo Bank", "Main Street, Ruwa"),
            ("Demo Main Mall", "Mall Road, Ruwa"),
        ]
        premises = []
        for name, addr in premises_data:
            prem, prem_created = Premise.objects.get_or_create(name=name, defaults={"address": addr})
            if prem_created:
                created["premises"] += 1
            premises.append(prem)

        # 3) create shifts for next 5 days (day shift 08:00-16:00)
        self.stdout.write("Creating demo shifts (next 5 days) ...")
        today = timezone.localdate()
        for delta in range(0, 5):
            d = today + timedelta(days=delta)
            for idx, prem in enumerate(premises):
                # either already exists, else create
                shift_defaults = {
                    "start_time": time(8, 0),
                    "end_time": time(16, 0),
                    "required_skills": "first-aid,patrol",
                }
                shift, shift_created = Shift.objects.get_or_create(premise=prem, date=d, defaults=shift_defaults)
                if shift_created:
                    created["shifts"] += 1
                # assign guards to some shifts for demo
                if (delta + idx) < len(demo_guards):
                    shift.assigned_guard = demo_guards[(delta + idx) % len(demo_guards)]
                    shift.save()

        # 4) create some patrol coordinates for today for assigned guards (a few points each)
        self.stdout.write("Creating demo patrol coordinates ...")
        center_lat = -17.8292
        center_lng = 31.0522
        now = timezone.now()
        created_patrols = 0
        for g in demo_guards:
            # pick assigned shift for today if any
            shifts_today = Shift.objects.filter(date=today, assigned_guard=g)
            if not shifts_today.exists():
                continue
            shift = shifts_today.first()
            # create 3 random patrol points
            for i in range(3):
                lat = center_lat + random.uniform(-0.01, 0.01)
                lng = center_lng + random.uniform(-0.015, 0.015)
                timestamp = now - timedelta(minutes=random.randint(0, 120))
                PatrolCoordinate.objects.create(guard=g, shift=shift, lat=lat, lng=lng, timestamp=timestamp)
                created_patrols += 1
        created["patrols"] = created_patrols

        # 5) create some attendance records for today for first two demo guards
        self.stdout.write("Creating demo attendance ...")
        created_att = 0
        for idx, g in enumerate(demo_guards[:3]):
            shifts = Shift.objects.filter(date=today, assigned_guard=g)
            if not shifts.exists():
                continue
            shift = shifts.first()
            # create attendance at shift start time + a few minutes
            check_in_dt = timezone.make_aware(datetime.combine(today, time(8, 0))) + timedelta(minutes=idx * 5)
            AttendanceRecord.objects.get_or_create(
                guard=g,
                shift=shift,
                check_in_time=check_in_dt,
                defaults={"qr_payload": {"type": "premise", "id": shift.premise.id}, "status": "ON_TIME"}
            )
            created_att += 1
        created["attendance"] = created_att

        # Done summary
        self.stdout.write(self.style.SUCCESS("Demo data creation complete. Summary:"))
        for k, v in created.items():
            self.stdout.write(f"  {k}: {v}")

        self.stdout.write(self.style.NOTICE("Demo accounts use password: password123"))
        self.stdout.write(self.style.NOTICE("You can remove demo data by running with --force next time."))
