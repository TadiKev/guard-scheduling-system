# backend/guards/urls.py
from rest_framework import routers
from django.urls import path, include
from .views import (
    UserViewSet,
    GuardProfileViewSet,
    PremiseViewSet,
    ShiftViewSet,
    PatrolViewSet,
    RegisterView,
    PremiseQRView,
    AttendanceView,
    DashboardSummaryView,
    DashboardAnalyticsView,
    ActiveGuardsView,
    PatrolHeatmapView,
    AllocateView,
    RecentAssignmentsView,
    GuardAttendanceHistoryView,
    QRCheckInView,
    RecentGuardAttendanceView
)

router = routers.DefaultRouter()
router.register(r"users", UserViewSet, basename="user")
router.register(r"guards", GuardProfileViewSet, basename="guardprofile")
router.register(r"premises", PremiseViewSet, basename="premise")
router.register(r"shifts", ShiftViewSet, basename="shift")
router.register(r"patrols", PatrolViewSet, basename="patrol")

urlpatterns = [
    path("", include(router.urls)),
    path("register/", RegisterView.as_view(), name="register"),
    path("attendance/", AttendanceView.as_view(), name="attendance"),
    path("allocate/", AllocateView.as_view(), name="allocate"),
    path("assignments/recent/", RecentAssignmentsView.as_view(), name="assignments-recent"),
    path("premises/<int:pk>/qr/", PremiseQRView.as_view(), name="premise-qr"),
    path("dashboard/summary/", DashboardSummaryView.as_view(), name="dashboard-summary"),
    path("dashboard/analytics/", DashboardAnalyticsView.as_view(), name="dashboard-analytics"),
    path("attendance/history/", GuardAttendanceHistoryView.as_view(), name="attendance-history"),
    path("active-guards/", ActiveGuardsView.as_view(), name="active-guards"),
    path("patrols/heatmap/", PatrolHeatmapView.as_view(), name="patrol-heatmap"),
    path("attendance/checkin/", QRCheckInView.as_view(), name="attendance-checkin"),
    path("attendance/my/", RecentGuardAttendanceView.as_view(), name="attendance-my"),
]
