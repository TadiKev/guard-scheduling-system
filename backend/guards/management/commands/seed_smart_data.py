# backend/guards/management/commands/seed_smart_data.py
import random
from datetime import date, datetime, time, timedelta
from io import BytesIO

from django.core.management.base import BaseCommand
from django.utils import timezone
from django.contrib.auth import get_user_model

from guards.models import GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate, Checkpoint, CheckpointLog

User = get_user_model()


class Command(BaseCommand):
    help = "Seed a clean minimal dataset for dev/testing: 5 guards, premises, shifts + QR images. Removes existing guard users and related data."

    def handle(self, *args, **options):
        self.stdout.write("Starting seed_smart_data...")

        # 0) remove guard-specific data (but keep staff/superusers)
        self.stdout.write("Removing previous guard users/profiles, related shifts, attendances, patrols...")
        guard_users = User.objects.filter(is_guard=True)
        gu_count = guard_users.count()
        guard_user_ids = list(guard_users.values_list("id", flat=True))
        # Delete guard-related rows safely
        AttendanceRecord.objects.filter(guard_id__in=guard_user_ids).delete()
        PatrolCoordinate.objects.filter(guard_id__in=guard_user_ids).delete()
        CheckpointLog.objects.filter(guard_id__in=guard_user_ids).delete()
        Shift.objects.filter(assigned_guard_id__in=guard_user_ids).update(assigned_guard=None, assigned_at=None)
        GuardProfile.objects.filter(user_id__in=guard_user_ids).delete()
        # delete guard users themselves
        guard_users.delete()
        self.stdout.write(f"Removed {gu_count} guard users and related records.")

        # Optionally remove existing premises/shifts from earlier junk — comment out if you want to keep
        Premise.objects.all().delete()
        Shift.objects.all().delete()
        self.stdout.write("Cleared existing Premise and Shift records (dev-only).")

        # 1) create 5 guards
        self.stdout.write("Creating 5 guard users & profiles...")
        guards_spec = [
            ("guard01", "Mall,retail", 2, "0711111111"),
            ("guard02", "industrial,patrol", 4, "0712222222"),
            ("guard03", "hotel,security", 1, "0713333333"),
            ("guard04", "banking,alarm", 3, "0714444444"),
            ("guard05", "construction,heavy", 5, "0715555555"),
        ]

        created_guards = []
        for uname, skills, exp, phone in guards_spec:
            u = User.objects.create(username=uname, is_guard=True, is_staff=False, email=f"{uname}@example.test")
            u.set_password("password")  # dev password
            u.save()
            gp = GuardProfile.objects.create(user=u, skills=skills, experience_years=exp, phone=phone)
            # ensure qr image is generated
            try:
                gp.generate_qr_image(force=True)
                gp.save()
            except Exception:
                # if file storage missing, ignore but keep qr_uuid set
                gp.save()
            created_guards.append((u, gp))
            self.stdout.write(f"  - created {uname} with skills [{skills}], uuid={gp.qr_uuid}")

        # 2) create premises matching those skills
        self.stdout.write("Creating premises (sites)...")
        premises_spec = [
            ("Main Mall", "City center shopping mall", "mall,retail"),
            ("Gweru Industrial Park", "Industrial park and warehouses", "industrial,patrol"),
            ("Harare Hotel", "Large hotel site", "hotel,security"),
            ("Central Bank Branch", "Bank branch requiring alarm-trained guards", "banking,alarm"),
            ("Construction Site A", "Construction site", "construction,heavy"),
        ]
        created_premises = []
        for name, addr, req in premises_spec:
            p = Premise.objects.create(name=name, address=addr, required_skills=req)
            try:
                p.generate_qr_image(force=True)
                p.save()
            except Exception:
                p.save()
            created_premises.append(p)
            self.stdout.write(f"  - created premise {name} (req: {req}) id={p.id} uuid={p.uuid}")

        # 3) create shifts for today and tomorrow for each premise (morning, evening)
        today = timezone.localdate()
        self.stdout.write("Creating shifts for today and tomorrow...")
        times = [(time(6, 0), time(14, 0)), (time(14, 0), time(22, 0)), (time(22, 0), time(6, 0))]  # third overnight
        for d in [today, today + timedelta(days=1), today + timedelta(days=2)]:
            for p in created_premises:
                for st, et in times:
                    # For overnight shifts, store end_time less than start_time is allowed (we handle in serializers)
                    s = Shift.objects.create(premise=p, date=d, start_time=st, end_time=et, required_skills=p.required_skills)
        self.stdout.write("Shifts created.")

        # 4) quick optional: create a few patrol points to show on map (use last location from each guard)
        self.stdout.write("Seeding sample patrol coordinates for guards...")
        for (u, gp) in created_guards:
            # pick a premise roughly and random lat/lng around Harare (-17.8, 31.0) for demo
            lat = -17.82 + random.uniform(-0.02, 0.02)
            lng = 31.04 + random.uniform(-0.02, 0.02)
            PatrolCoordinate.objects.create(guard=u, shift=Shift.objects.filter(premise__in=created_premises).first(), lat=lat, lng=lng, accuracy=5.0)
            # update guard profile last seen
            try:
                gp.last_seen = timezone.now()
                gp.last_lat = lat
                gp.last_lng = lng
                gp.status = "on_patrol"
                gp.save(update_fields=["last_seen", "last_lat", "last_lng", "status"])
            except Exception:
                gp.save()

        self.stdout.write(self.style.SUCCESS("Seed complete."))
        self.stdout.write("Credentials: guard01..guard05 / password")
        self.stdout.write("Use ScanGuard page or POST /api/allocate/scan_guard/ with guard token or qr_payload.")
