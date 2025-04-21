from django.contrib import admin
from .models import Product, Process, ProductionOrder, Inventory


@admin.register(Product)
class ProductAdmin(admin.ModelAdmin):
    list_display = ("code", "name", "created_at", "updated_at")
    search_fields = ("code", "name")
    ordering = ("code",)


@admin.register(Process)
class ProcessAdmin(admin.ModelAdmin):
    list_display = ("name", "standard_time", "created_at")
    search_fields = ("name",)


@admin.register(ProductionOrder)
class ProductionOrderAdmin(admin.ModelAdmin):
    list_display = ("product", "process", "quantity", "planned_date", "status")
    list_filter = ("status", "planned_date", "process")
    search_fields = ("product__name", "product__code")
    date_hierarchy = "planned_date"


@admin.register(Inventory)
class InventoryAdmin(admin.ModelAdmin):
    list_display = ("product", "quantity", "location", "updated_at")
    list_filter = ("location",)
    search_fields = ("product__name", "product__code", "location")
