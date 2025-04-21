from django.urls import path
from . import views

urlpatterns = [
    path("health/", views.health_check, name="health-check"),
    path("", views.ProductListView.as_view(), name="product-list"),
    path(
        "production-orders/",
        views.ProductionOrderListView.as_view(),
        name="production-order-list",
    ),
    path(
        "production-orders/create/",
        views.ProductionOrderCreateView.as_view(),
        name="production-order-create",
    ),
    path("inventory/", views.InventoryListView.as_view(), name="inventory-list"),
]
