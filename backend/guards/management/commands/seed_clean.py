# backend/guards/management/commands/seed_clean.py
import random
from datetime import time, timedelta as dt_timedelta, datetime as dt_datetime
from io import BytesIO

from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone
from django.contrib.auth import get_user_model

from guards.models import (
    GuardProfile, Premise, Shift, AttendanceRecord,
    PatrolCoordinate, Checkpoint, CheckpointLog
)

User = get_user_model()


def _mk_time(h, m=0):
    return time(h, m)


class Command(BaseCommand):
    help = "Wipe junk (non-superuser) guard data and seed balanced Zimbabwe sample data. USE WITH CARE."

    def add_arguments(self, parser):
        parser.add_argument("--yes", action="store_true", help="Skip confirmation prompt")
        parser.add_argument("--days", type=int, default=7, help="How many days of shifts to create (default 7)")
        parser.add_argument("--guards", type=int, default=12, help="How many guard users to create (default 12)")

    def handle(self, *args, **options):
        if not options.get("yes"):
            confirm = input("This will DELETE guard-related data and non-superuser accounts. Type 'yes' to continue: ")
            if confirm.strip().lower() != "yes":
                self.stdout.write(self.style.WARNING("Aborted by user."))
                return

        days = max(1, min(30, int(options.get("days", 7))))
        num_guards = max(1, min(200, int(options.get("guards", 12))))

        with transaction.atomic():
            # Delete guard-related objects
            self.stdout.write("Deleting old guard data (attendance, patrols, shifts, checkpoints, profiles, premises) ...")
            AttendanceRecord.objects.all().delete()
            PatrolCoordinate.objects.all().delete()
            CheckpointLog.objects.all().delete()
            Checkpoint.objects.all().delete()
            Shift.objects.all().delete()
            GuardProfile.objects.all().delete()
            Premise.objects.all().delete()

            # Delete non-superuser users (this removes existing test junk)
            non_super = User.objects.filter(is_superuser=False)
            cnt_non_super = non_super.count()
            if cnt_non_super:
                non_super.delete()
            self.stdout.write(self.style.SUCCESS(f"Removed {cnt_non_super} non-superuser users."))

            # Ensure at least one admin exists — if not, create admin/adminpass
            if not User.objects.filter(is_superuser=True).exists():
                admin = User.objects.create_superuser(username="admin", email="admin@example.com", password="adminpass")
                self.stdout.write(self.style.SUCCESS("No superuser found — created admin/adminpass"))
            else:
                self.stdout.write("Superuser(s) present — leaving them intact.")

            # Seed premises (Zimbabwe context)
            premises_data = [
                {"name": "Bulawayo Central Mall", "address": "Bulawayo CBD, Bulawayo", "lat": -20.146, "lng": 28.584, "required_skills": "retail,patrol"},
                {"name": "Harare CBD", "address": "Samora Machel Ave, Harare", "lat": -17.8252, "lng": 31.0335, "required_skills": "retail,events"},
                {"name": "Mutare Market", "address": "Samora Machel St, Mutare", "lat": -18.9707, "lng": 32.6700, "required_skills": "market,retail"},
                {"name": "Gweru Industrial Park", "address": "Gweru Industrial Area", "lat": -19.4476, "lng": 29.8196, "required_skills": "industrial,site_security"},
                {"name": "Victoria Falls Site", "address": "Victoria Falls Town", "lat": -17.9243, "lng": 25.8262, "required_skills": "tourism,patrol"},
            ]
            premises = []
            for p in premises_data:
                pm = Premise.objects.create(name=p["name"], address=p["address"], required_skills=p["required_skills"])
                # skip heavy image generation — models handle QR on save; if your environment lacks Pillow/qrcode this may still work
                pm.generate_qr_image(force=True)
                pm.save()
                premises.append({"obj": pm, "lat": p["lat"], "lng": p["lng"]})

            self.stdout.write(self.style.SUCCESS(f"Created {len(premises)} premises."))

            # Seed guard users & profiles
            skills_pool = [
                "patrol", "first_aid", "fire_safety", "customer_service", "retail",
                "checkpoint", "dog_handling", "crowd_control", "site_security"
            ]
            guards = []
            for i in range(num_guards):
                uname = f"guard{i+1:02d}"
                user = User.objects.create(username=uname, is_guard=True, email=f"{uname}@example.local")
                # set usable password for dev/testing
                user.set_password("password123")
                user.save()
                prof = GuardProfile.objects.create(
                    user=user,
                    skills=",".join(random.sample(skills_pool, k=random.randint(1, 3))),
                    experience_years=random.randint(0, 10),
                    phone=f"+2637{random.randint(100000,999999)}",
                )
                prof.status = random.choice(["on_patrol", "on_break", "off_duty"])
                prof.last_seen = timezone.now() - dt_timedelta(minutes=random.randint(0, 120))
                # randomly seed location near a premise
                prem_choice = random.choice(premises)
                jitter_lat = prem_choice["lat"] + (random.random() - 0.5) * 0.02
                jitter_lng = prem_choice["lng"] + (random.random() - 0.5) * 0.02
                prof.last_lat = jitter_lat
                prof.last_lng = jitter_lng
                prof.save()
                guards.append({"user": user, "profile": prof, "home_prem": prem_choice})

            self.stdout.write(self.style.SUCCESS(f"Created {len(guards)} guard users & profiles."))

            # Create shifts for the next N days (2 shifts per day per premise: morning and evening)
            today = timezone.localdate()
            shifts_created = []
            for day_offset in range(days):
                day = today + dt_timedelta(days=day_offset)
                for p in premises:
                    # Morning: 07:00-15:00 ; Evening: 15:00-23:00 ; Night optional 23:00-07:00 next day
                    shift_defs = [
                        (_mk_time(7, 0), _mk_time(15, 0)),
                        (_mk_time(15, 0), _mk_time(23, 0)),
                    ]
                    for start_t, end_t in shift_defs:
                        s = Shift.objects.create(
                            premise=p["obj"],
                            date=day,
                            start_time=start_t,
                            end_time=end_t,
                            required_skills=p["obj"].required_skills
                        )
                        shifts_created.append(s)
            self.stdout.write(self.style.SUCCESS(f"Created {len(shifts_created)} shifts for next {days} days."))

            # Assign some guards to some shifts evenly (round-robin), leaving some unassigned to simulate real world
            assignable_shifts = [s for s in shifts_created]
            random.shuffle(assignable_shifts)
            guard_cycle = guards.copy()
            random.shuffle(guard_cycle)
            assigned_count = 0
            for idx, s in enumerate(assignable_shifts):
                # assign roughly 60% of shifts
                if random.random() < 0.60:
                    g = guard_cycle[idx % len(guard_cycle)]
                    s.assigned_guard = g["user"]
                    s.assigned_at = timezone.now() - dt_timedelta(minutes=random.randint(1, 120))
                    s.save(update_fields=["assigned_guard", "assigned_at"])
                    assigned_count += 1
            self.stdout.write(self.style.SUCCESS(f"Assigned {assigned_count} shifts (approx 60%)."))

            # Create recent patrol points for guards (one or two points each) and attendance records for today's shifts
            patrol_count = 0
            attendance_count = 0
            for g in guards:
                # 0..3 points
                num_pts = random.randint(0, 3)
                for j in range(num_pts):
                    lat = g["home_prem"]["lat"] + (random.random() - 0.5) * 0.01
                    lng = g["home_prem"]["lng"] + (random.random() - 0.5) * 0.01
                    pt = PatrolCoordinate.objects.create(
                        guard=g["user"],
                        shift=random.choice(shifts_created),
                        timestamp=timezone.now() - dt_timedelta(minutes=random.randint(0, 180)),
                        lat=lat,
                        lng=lng,
                        accuracy=random.uniform(3.0, 25.0)
                    )
                    patrol_count += 1

                # attendance: pick today's assigned shift (if any)
                todays = [s for s in shifts_created if s.date == today and s.assigned_guard_id == g["user"].id]
                if todays:
                    chosen = random.choice(todays)
                    # check-in within window (on_time or late)
                    start_dt = dt_datetime.combine(chosen.date, chosen.start_time)
                    # make aware to timezone
                    if timezone.is_naive(start_dt):
                        start_dt = timezone.make_aware(start_dt, timezone.get_current_timezone())
                    # checkin time slightly after start
                    check_in_time = start_dt + dt_timedelta(minutes=random.randint(0, 30))
                    status = "ON_TIME" if (check_in_time - start_dt).total_seconds() <= 60 * 15 else "LATE"
                    AttendanceRecord.objects.create(
                        guard=g["user"],
                        shift=chosen,
                        check_in_time=check_in_time,
                        check_in_lat=g["profile"].last_lat,
                        check_in_lng=g["profile"].last_lng,
                        qr_payload={"type": "premise", "id": chosen.premise.id, "uuid": str(chosen.premise.uuid)},
                        status=status
                    )
                    attendance_count += 1

            self.stdout.write(self.style.SUCCESS(f"Created {patrol_count} patrol points and {attendance_count} attendance records."))

        # Done
        self.stdout.write(self.style.SUCCESS("Seeding complete. Summary:"))
        self.stdout.write(self.style.SUCCESS(f"  premises: {len(premises)}"))
        self.stdout.write(self.style.SUCCESS(f"  guards: {len(guards)}"))
        self.stdout.write(self.style.SUCCESS(f"  shifts: {len(shifts_created)}"))
        self.stdout.write(self.style.SUCCESS(f"  assigned shifts (approx): {assigned_count}"))
        self.stdout.write(self.style.SUCCESS("You can log in as guard users (password='password123') or admin if created."))
