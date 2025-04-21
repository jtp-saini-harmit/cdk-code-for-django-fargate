from django.shortcuts import render, redirect, get_object_or_404
from django.contrib import messages
from django.views.generic import ListView, CreateView, UpdateView
from django.http import HttpResponse
from django.views.decorators.csrf import csrf_exempt
from django.urls import reverse_lazy
from .models import Product, Process, ProductionOrder, Inventory


@csrf_exempt
def health_check(request):
    return HttpResponse("OK", status=200)


class ProductListView(ListView):
    model = Product
    template_name = "products/product_list.html"
    context_object_name = "products"
    ordering = ["code"]


class ProductionOrderListView(ListView):
    model = ProductionOrder
    template_name = "products/production_order_list.html"
    context_object_name = "orders"
    ordering = ["-planned_date"]

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["products"] = Product.objects.all()
        context["processes"] = Process.objects.all()
        return context


class ProductionOrderCreateView(CreateView):
    model = ProductionOrder
    template_name = "products/production_order_form.html"
    fields = ["product", "process", "quantity", "planned_date", "notes"]
    success_url = reverse_lazy("production-order-list")

    def form_valid(self, form):
        messages.success(self.request, "製造指示を作成しました。")
        return super().form_valid(form)


class InventoryListView(ListView):
    model = Inventory
    template_name = "products/inventory_list.html"
    context_object_name = "inventories"

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        context["products"] = Product.objects.all()
        return context
