# backend/guards/management/commands/generate_premise_qr.py
import sys
from django.core.management.base import BaseCommand
from django.db import transaction
from django.utils import timezone

from guards.models import Premise

class Command(BaseCommand):
    help = "Generate (or regenerate) QR images for Premise.qr_image for all premises (or --id to target)."

    def add_arguments(self, parser):
        parser.add_argument("--id", type=int, help="Generate QR only for the premise with this ID")
        parser.add_argument("--force", action="store_true", help="Force regeneration even if qr_image exists")
        parser.add_argument("--dry-run", action="store_true", help="Show which premises would be processed but do not save files")

    def handle(self, *args, **options):
        pid = options.get("id")
        force = options.get("force", False)
        dry = options.get("dry_run", False)

        qs = Premise.objects.all().order_by("id")
        if pid:
            qs = qs.filter(pk=pid)

        total = qs.count()
        if total == 0:
            self.stdout.write(self.style.WARNING("No premises found for the given criteria."))
            return

        processed = 0
        failed = 0

        for p in qs:
            try:
                self.stdout.write(f"[{p.id}] {p.name} — force={force} dry_run={dry}")
                if dry:
                    processed += 1
                    continue

                # generate QR image (method on model). Use force parameter passed through.
                p.generate_qr_image(force=force)

                # save model to persist qr_image (generate_qr_image sets it via Field.save)
                p.save(update_fields=["qr_image"])
                processed += 1
            except Exception as e:
                failed += 1
                self.stderr.write(f"Failed for premise id={p.id} name={p.name}: {e}")

        self.stdout.write(self.style.SUCCESS(f"Done — processed: {processed}, failed: {failed}"))
