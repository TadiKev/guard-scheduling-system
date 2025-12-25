# backend/guards/allocation.py
from datetime import timedelta, date
from typing import List, Dict, Optional, Tuple
from django.db.models import Q, Count
from django.utils import timezone

from .models import Shift, GuardProfile
from django.contrib.auth import get_user_model

User = get_user_model()

# Tunable parameters (can be moved into settings)
MAX_CONSECUTIVE_DAYS = 6
RECENT_FAIRNESS_WINDOW_DAYS = 7

# Scoring weights
WEIGHT_SKILL_MATCH = 5.0
WEIGHT_EXPERIENCE = 0.5
WEIGHT_CONSECUTIVE_PENALTY = 1.0
WEIGHT_FAIRNESS_PENALTY = 0.8

def _split_tags(s: str) -> List[str]:
    if not s:
        return []
    return [t.strip().lower() for t in s.split(",") if t.strip()]

def find_candidates(shift: Shift) -> List[User]:
    """
    Return list of User objects (guards) that are potential candidates for the shift.
    Filters by: is_guard=True, not already assigned to another shift at the same date/time,
                and not violating the MAX_CONSECUTIVE_DAYS rule.
    """
    # base guards
    guards = User.objects.filter(is_guard=True)

    # exclude guards assigned to another shift at the same date and overlapping time
    same_day_shifts = Shift.objects.filter(date=shift.date).exclude(pk=shift.pk)
    # Find guards with any assignment on same day
    assigned_user_ids = same_day_shifts.exclude(assigned_guard__isnull=True).values_list("assigned_guard_id", flat=True)
    guards = guards.exclude(id__in=list(assigned_user_ids))

    # filter out guards who would exceed MAX_CONSECUTIVE_DAYS if assigned
    viable = []
    for g in guards:
        # compute consecutive days before shift.date
        consecutive = _consecutive_days_before(g, shift.date)
        if consecutive >= MAX_CONSECUTIVE_DAYS:
            # skip: assigning would exceed limit
            continue
        viable.append(g)
    return viable

def _consecutive_days_before(guard: User, ref_date: date) -> int:
    """
    Count number of consecutive previous days (immediately before ref_date) where guard has at least one assigned shift.
    """
    days = 0
    check_date = ref_date - timedelta(days=1)
    while True:
        exists = Shift.objects.filter(date=check_date, assigned_guard=guard).exists()
        if exists:
            days += 1
            check_date -= timedelta(days=1)
            if days >= MAX_CONSECUTIVE_DAYS:
                break
        else:
            break
    return days

def _recent_assignments_count(guard: User, ref_date: date, window_days: int = RECENT_FAIRNESS_WINDOW_DAYS) -> int:
    start = ref_date - timedelta(days=window_days - 1)
    return Shift.objects.filter(date__range=(start, ref_date), assigned_guard=guard).count()

def score_guard_for_shift(guard: User, shift: Shift) -> Tuple[float, Dict]:
    """
    Compute and return (score, breakdown) for guard->shift assignment.
    breakdown is a dict with components for debugging.
    """
    profile = getattr(guard, "profile", None)
    guard_skills = _split_tags(profile.skills if profile else "")
    shift_skills = _split_tags(shift.required_skills or "")

    # skill match = fraction of required skill tags present (0..1). If shift requires none -> treat as 1.
    if not shift_skills:
        skill_frac = 1.0
    else:
        matches = sum(1 for s in shift_skills if s in guard_skills)
        skill_frac = matches / len(shift_skills)

    skill_score = skill_frac * WEIGHT_SKILL_MATCH

    experience_years = profile.experience_years if profile else 0
    experience_score = min(experience_years, 20) * WEIGHT_EXPERIENCE  # cap experience effect

    consecutive_before = _consecutive_days_before(guard, shift.date)
    consecutive_penalty = consecutive_before * WEIGHT_CONSECUTIVE_PENALTY

    fairness_recent = _recent_assignments_count(guard, shift.date)
    fairness_penalty = fairness_recent * WEIGHT_FAIRNESS_PENALTY

    total = skill_score + experience_score - consecutive_penalty - fairness_penalty

    breakdown = {
        "skill_frac": skill_frac,
        "skill_score": skill_score,
        "experience_years": experience_years,
        "experience_score": experience_score,
        "consecutive_before": consecutive_before,
        "consecutive_penalty": consecutive_penalty,
        "fairness_recent": fairness_recent,
        "fairness_penalty": fairness_penalty,
        "total": total,
    }
    return total, breakdown

def run_allocation_for_day(run_date: date) -> Dict:
    """
    Run allocation for all unassigned shifts on a given date.
    Returns a dict with per-shift result and an overall summary.
    """
    results = {}
    shifts = Shift.objects.filter(date=run_date).order_by("start_time")
    assigned_count = 0
    unassigned = []

    for shift in shifts:
        # skip if already assigned
        if shift.assigned_guard_id:
            results[shift.id] = {
                "status": "already_assigned",
                "assigned_guard_id": shift.assigned_guard_id,
                "assigned_guard_username": getattr(shift.assigned_guard, "username", None),
            }
            continue

        candidates = find_candidates(shift)
        scored = []
        for g in candidates:
            score, breakdown = score_guard_for_shift(g, shift)
            scored.append((score, g, breakdown))

        if not scored:
            # no viable candidates
            results[shift.id] = {"status": "no_candidates", "reason": "no_viable_candidates"}
            unassigned.append(shift.id)
            continue

        # pick top score
        scored.sort(key=lambda t: t[0], reverse=True)
        best_score, best_guard, best_breakdown = scored[0]

        # Option: require a minimum skill fraction to accept; if skill_frac==0 -> partial match
        min_skill_frac_accept = 0.0  # set to 0.0 to accept partial matches; raise to 0.5 to require at least half skills
        if best_breakdown["skill_frac"] < min_skill_frac_accept:
            results[shift.id] = {"status": "rejected_by_skill_threshold", "best_score": best_score, "breakdown": best_breakdown}
            unassigned.append(shift.id)
            continue

        # assign guard
        shift.assigned_guard = best_guard
        shift.save(update_fields=["assigned_guard"])
        assigned_count += 1
        results[shift.id] = {
            "status": "assigned",
            "assigned_guard_id": best_guard.id,
            "assigned_guard_username": best_guard.username,
            "score": best_score,
            "breakdown": best_breakdown,
        }

    summary = {"date": str(run_date), "total_shifts": shifts.count(), "assigned": assigned_count, "unassigned": len(unassigned)}
    return {"summary": summary, "shifts": results}

def run_allocation_for_range(start_date: date, end_date: date) -> Dict:
    """
    Run allocation across a date range inclusive. Returns dict mapping each date to its run results.
    """
    out = {}
    cur = start_date
    while cur <= end_date:
        out[str(cur)] = run_allocation_for_day(cur)
        cur = cur + timedelta(days=1)
    return out
