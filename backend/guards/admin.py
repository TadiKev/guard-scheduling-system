# backend/guards/admin.py
from django.contrib import admin
from django.contrib.auth.admin import UserAdmin
from .models import CustomUser, GuardProfile, Premise, Shift, AttendanceRecord, PatrolCoordinate

@admin.register(CustomUser)
class CustomUserAdmin(UserAdmin):
    fieldsets = UserAdmin.fieldsets + (
        ("Custom flags", {"fields": ("is_guard", "is_admin")}),
    )

@admin.register(GuardProfile)
class GuardProfileAdmin(admin.ModelAdmin):
    list_display = ("user", "experience_years", "phone", "max_consecutive_days")

@admin.register(Premise)
class PremiseAdmin(admin.ModelAdmin):
    list_display = ("id", "name", "address", "uuid")
    readonly_fields = ("uuid", "qr_image")
    actions = ["regenerate_qr"]

    def regenerate_qr(self, request, queryset):
        for p in queryset:
            p.generate_qr_image(force=True)
            p.save()
        self.message_user(request, "QR images regenerated for selected premises.")
    regenerate_qr.short_description = "Regenerate QR images"

@admin.register(Shift)
class ShiftAdmin(admin.ModelAdmin):
    list_display = ("id", "premise", "date", "start_time", "end_time", "assigned_guard")

@admin.register(AttendanceRecord)
class AttendanceAdmin(admin.ModelAdmin):
    list_display = ("id", "guard", "shift", "check_in_time", "status", "check_in_lat", "check_in_lng")
    readonly_fields = ("qr_payload",)

@admin.register(PatrolCoordinate)
class PatrolAdmin(admin.ModelAdmin):
    list_display = ("id", "guard", "shift", "timestamp", "lat", "lng")
