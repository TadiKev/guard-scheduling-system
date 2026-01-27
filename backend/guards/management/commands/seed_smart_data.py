# backend/guards/management/commands/seed_smart_data.py
from django.core.management.base import BaseCommand
from django.contrib.auth import get_user_model
from django.utils import timezone
from django.db import transaction
from datetime import date, timedelta, time
import random

from guards.models import Premise, GuardProfile, Shift

User = get_user_model()

ZIM_PREMISES = [
    ("Main Mall", "Bulawayo CBD"),
    ("Bulawayo Central Mall", "Bulawayo CBD"),
    ("Northgate Center", "Harare North"),
    ("West End Complex", "Gweru"),
    ("Highfield Plaza", "Harare"),
    ("Victoria Falls Lodge", "Vic Falls"),
    ("Mutare City Mall", "Mutare"),
    ("Killarney Shopping Centre", "Harare"),
]

SKILL_POOL = ["crowd-control", "customer-service", "first-aid", "cash-handling", "fire-safety", "night-shift"]

class Command(BaseCommand):
    help = "Seed balanced premises, guards, shifts and generate QR codes. Use --drop to remove existing data."

    def add_arguments(self, parser):
        parser.add_argument("--drop", action="store_true", help="Delete existing guards/premises/shifts before seeding")
        parser.add_argument("--guards", type=int, default=30, help="Number of guards to create")
        parser.add_argument("--start-date", type=str, default=None, help="Start date YYYY-MM-DD for shifts")
        parser.add_argument("--days", type=int, default=3, help="Number of days to create shifts for")
        parser.add_argument("--shifts-per-premise", type=int, default=2, help="Shifts per premise per day")

    def handle(self, *args, **options):
        if options["drop"]:
            self.stdout.write("Deleting existing guard users, profiles, premises, shifts (CAREFUL)...")
            with transaction.atomic():
                Shift.objects.all().delete()
                GuardProfile.objects.all().delete()
                User.objects.filter(username__startswith="guard_").delete()
                Premise.objects.filter(name__in=[p[0] for p in ZIM_PREMISES]).delete()

        # create premises
        premises = []
        for name, addr in ZIM_PREMISES:
            p, _ = Premise.objects.get_or_create(name=name, defaults={"address": addr})
            # generate qr image
            try:
                p.generate_qr_image(force=True)
                p.save()
            except Exception:
                pass
            premises.append(p)

        # create guards
        guard_count = options["guards"]
        guards = []
        for i in range(guard_count):
            username = f"guard_{i+1:03d}"
            user, created = User.objects.get_or_create(username=username, defaults={
                "is_guard": True,
                "first_name": f"G{i+1}",
                "email": f"{username}@example.com",
            })
            if created:
                user.set_password("password123")
                user.save()
            profile, _ = GuardProfile.objects.get_or_create(user=user, defaults={
                "skills": ",".join(random.sample(SKILL_POOL, k=random.randint(1, 3))),
                "experience_years": random.randint(0, 8),
                "phone": f"+2637{random.randint(100000,999999)}",
            })
            profile.generate_qr_image(force=True)
            profile.save()
            guards.append((user, profile))

        # create shifts across date range
        start_date = date.fromisoformat(options["start_date"]) if options["start_date"] else timezone.localdate()
        days = options["days"]
        shifts_per_premise = options["shifts_per_premise"]
        for d in range(days):
            day = start_date + timedelta(days=d)
            for p in premises:
                for s_idx in range(shifts_per_premise):
                    # morning / evening spreads
                    if s_idx % 2 == 0:
                        st = time(hour=8, minute=0)
                        et = time(hour=16, minute=0)
                    else:
                        st = time(hour=16, minute=0)
                        et = time(hour=23, minute=59)
                    Shift.objects.create(premise=p, date=day, start_time=st, end_time=et, required_skills=random.choice([p.required_skills or "", ",".join(random.sample(SKILL_POOL, k=1))]) )

        self.stdout.write(self.style.SUCCESS("Seeding complete. Created premises, guards, profiles, shifts and generated QR images."))
