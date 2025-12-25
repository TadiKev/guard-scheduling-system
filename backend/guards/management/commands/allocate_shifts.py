# backend/guards/management/commands/allocate_shifts.py
from django.core.management.base import BaseCommand, CommandError
from django.utils.dateparse import parse_date
from guards.allocation import run_allocation_for_day, run_allocation_for_range

class Command(BaseCommand):
    help = "Allocate shifts for a single date or date range. Usage: --date YYYY-MM-DD  OR  --start YYYY-MM-DD --end YYYY-MM-DD"

    def add_arguments(self, parser):
        parser.add_argument("--date", dest="date", help="Single date to run allocation (YYYY-MM-DD)")
        parser.add_argument("--start", dest="start_date", help="Start date (YYYY-MM-DD)")
        parser.add_argument("--end", dest="end_date", help="End date (YYYY-MM-DD)")

    def handle(self, *args, **options):
        d = options.get("date")
        s = options.get("start_date")
        e = options.get("end_date")

        if d:
            pd = parse_date(d)
            if not pd:
                raise CommandError("Invalid --date value")
            self.stdout.write(f"Running allocation for {pd.isoformat()} ...")
            res = run_allocation_for_day(pd)
            self.stdout.write(str(res["summary"]))
            # print per-shift short lines
            for sid, info in res["shifts"].items():
                self.stdout.write(f" Shift {sid}: {info.get('status')} - {info.get('assigned_guard_username') or info.get('reason', '')}")
            return

        if s and e:
            ps = parse_date(s)
            pe = parse_date(e)
            if not ps or not pe:
                raise CommandError("Invalid start/end date")
            self.stdout.write(f"Running allocation for {ps} -> {pe} ...")
            out = run_allocation_for_range(ps, pe)
            for day, res in out.items():
                self.stdout.write(f"Day {day} summary: {res['summary']}")
            return

        raise CommandError("Provide --date YYYY-MM-DD OR --start YYYY-MM-DD --end YYYY-MM-DD")
