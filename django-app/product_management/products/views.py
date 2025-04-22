from rest_framework import viewsets, filters
from rest_framework.decorators import action
from rest_framework.response import Response
from django.db.models import Sum, Count, F
from django.views.generic import TemplateView, ListView, CreateView, UpdateView, DeleteView
from django.contrib.auth.mixins import LoginRequiredMixin
from django.urls import reverse_lazy
from django.contrib import messages
from django.utils import timezone
from django.db.models.functions import TruncDate
from datetime import timedelta
from django_filters.rest_framework import DjangoFilterBackend
from .models import Category, Product, Customer, Sale, SaleItem
from .serializers import (
    CategorySerializer, ProductSerializer, CustomerSerializer,
    SaleSerializer, SaleItemSerializer
)

class DashboardView(LoginRequiredMixin, TemplateView):
    template_name = 'products/dashboard.html'

    def get_context_data(self, **kwargs):
        context = super().get_context_data(**kwargs)
        
        # Get date range for filtering (last 30 days)
        end_date = timezone.now()
        start_date = end_date - timedelta(days=30)
        
        # Basic statistics
        context['total_products'] = Product.objects.count()
        context['total_stock'] = Product.objects.aggregate(total=Sum('stock'))['total'] or 0
        context['total_categories'] = Category.objects.count()
        context['total_customers'] = Customer.objects.count()
        
        # Sales data for the chart
        sales_data = Sale.objects.filter(
            sale_date__range=(start_date, end_date),
            status='completed'
        ).annotate(
            date=TruncDate('sale_date')
        ).values('date').annotate(
            amount=Sum('total_amount')
        ).order_by('date')
        
        if sales_data:
            context['sales_data'] = True
            context['dates'] = [sale['date'].strftime('%Y-%m-%d') for sale in sales_data]
            context['sales_amounts'] = [float(sale['amount']) for sale in sales_data]
        
        # Top selling products
        context['top_products'] = Product.objects.annotate(
            sales_count=Count('saleitem')
        ).order_by('-sales_count')[:5]
        
        # Recent sales
        context['recent_sales'] = Sale.objects.select_related(
            'customer'
        ).order_by('-sale_date')[:5]
        
        # Low stock products (less than 10 items)
        context['low_stock_products'] = Product.objects.select_related(
            'category'
        ).filter(stock__lt=10).order_by('stock')[:5]
        
        # Total sales amount for last 30 days
        context['total_sales'] = Sale.objects.filter(
            sale_date__range=(start_date, end_date),
            status='completed'
        ).aggregate(total=Sum('total_amount'))['total'] or 0
        
        return context

class ProductListView(LoginRequiredMixin, ListView):
    model = Product
    template_name = 'products/product_list.html'
    context_object_name = 'products'
    paginate_by = 10
    
    def get_queryset(self):
        queryset = super().get_queryset()
        category_id = self.request.GET.get('category')
        search = self.request.GET.get('search')
        
        if category_id:
            queryset = queryset.filter(category_id=category_id)
        if search:
            queryset = queryset.filter(name__icontains=search)
        
        return queryset.select_related('category')

class ProductCreateView(LoginRequiredMixin, CreateView):
    model = Product
    template_name = 'products/product_form.html'
    fields = ['name', 'description', 'category', 'price', 'stock', 'image']
    success_url = reverse_lazy('products:product_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Product created successfully.')
        return super().form_valid(form)

class ProductUpdateView(LoginRequiredMixin, UpdateView):
    model = Product
    template_name = 'products/product_form.html'
    fields = ['name', 'description', 'category', 'price', 'stock', 'image']
    success_url = reverse_lazy('products:product_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Product updated successfully.')
        return super().form_valid(form)

class ProductDeleteView(LoginRequiredMixin, DeleteView):
    model = Product
    success_url = reverse_lazy('products:product_list')
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Product deleted successfully.')
        return super().delete(request, *args, **kwargs)

class CategoryCreateView(LoginRequiredMixin, CreateView):
    model = Category
    template_name = 'products/category_form.html'
    fields = ['name', 'description']
    success_url = reverse_lazy('products:category_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Category created successfully.')
        return super().form_valid(form)

class CategoryUpdateView(LoginRequiredMixin, UpdateView):
    model = Category
    template_name = 'products/category_form.html'
    fields = ['name', 'description']
    success_url = reverse_lazy('products:category_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Category updated successfully.')
        return super().form_valid(form)

class CategoryDeleteView(LoginRequiredMixin, DeleteView):
    model = Category
    success_url = reverse_lazy('products:category_list')
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Category deleted successfully.')
        return super().delete(request, *args, **kwargs)

class CategoryListView(LoginRequiredMixin, ListView):
    model = Category
    template_name = 'products/category_list.html'
    context_object_name = 'categories'
    paginate_by = 10

    def get_queryset(self):
        return super().get_queryset().annotate(
            products_count=Count('products')
        )

class CustomerCreateView(LoginRequiredMixin, CreateView):
    model = Customer
    template_name = 'products/customer_form.html'
    fields = ['name', 'email', 'phone', 'address']
    success_url = reverse_lazy('products:customer_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Customer created successfully.')
        return super().form_valid(form)

class CustomerUpdateView(LoginRequiredMixin, UpdateView):
    model = Customer
    template_name = 'products/customer_form.html'
    fields = ['name', 'email', 'phone', 'address']
    success_url = reverse_lazy('products:customer_list')
    
    def form_valid(self, form):
        messages.success(self.request, 'Customer updated successfully.')
        return super().form_valid(form)

class CustomerDeleteView(LoginRequiredMixin, DeleteView):
    model = Customer
    success_url = reverse_lazy('products:customer_list')
    
    def delete(self, request, *args, **kwargs):
        messages.success(request, 'Customer deleted successfully.')
        return super().delete(request, *args, **kwargs)

class CustomerListView(LoginRequiredMixin, ListView):
    model = Customer
    template_name = 'products/customer_list.html'
    context_object_name = 'customers'
    paginate_by = 10

    def get_queryset(self):
        return super().get_queryset().annotate(
            total_purchases=Count('sales')
        )

class CategoryViewSet(viewsets.ModelViewSet):
    queryset = Category.objects.all()
    serializer_class = CategorySerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name']

    @action(detail=True)
    def products(self, request, pk=None):
        category = self.get_object()
        products = category.products.all()
        serializer = ProductSerializer(products, many=True)
        return Response(serializer.data)

class ProductViewSet(viewsets.ModelViewSet):
    queryset = Product.objects.all()
    serializer_class = ProductSerializer
    filter_backends = [DjangoFilterBackend, filters.SearchFilter]
    filterset_fields = ['category']
    search_fields = ['name', 'description']

    @action(detail=False)
    def low_stock(self, request):
        threshold = int(request.query_params.get('threshold', 10))
        products = Product.objects.filter(stock__lte=threshold)
        serializer = self.get_serializer(products, many=True)
        return Response(serializer.data)

class CustomerViewSet(viewsets.ModelViewSet):
    queryset = Customer.objects.all()
    serializer_class = CustomerSerializer
    filter_backends = [filters.SearchFilter]
    search_fields = ['name', 'email']

    @action(detail=True)
    def purchase_history(self, request, pk=None):
        customer = self.get_object()
        sales = customer.sales.all()
        serializer = SaleSerializer(sales, many=True)
        return Response(serializer.data)

class SaleListView(LoginRequiredMixin, ListView):
    model = Sale
    template_name = 'products/sale_list.html'
    context_object_name = 'sales'
    paginate_by = 10

    def get_queryset(self):
        return super().get_queryset().select_related('customer')

class SaleViewSet(viewsets.ModelViewSet):
    queryset = Sale.objects.all()
    serializer_class = SaleSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['status', 'customer']

    def create(self, request, *args, **kwargs):
        serializer = self.get_serializer(
            data=request.data,
            context={'items': request.data.get('items', [])}
        )
        serializer.is_valid(raise_exception=True)
        self.perform_create(serializer)
        return Response(serializer.data)

    @action(detail=False)
    def dashboard_stats(self, request):
        total_sales = Sale.objects.filter(status='completed').aggregate(
            total=Sum('total_amount'))['total'] or 0
        top_products = SaleItem.objects.values(
            'product__name').annotate(
            total_quantity=Sum('quantity'),
            total_sales=Sum('total_price')
        ).order_by('-total_sales')[:5]
        recent_sales = Sale.objects.filter(
            status='completed').order_by('-created_at')[:5]

        return Response({
            'total_sales': total_sales,
            'top_products': top_products,
            'recent_sales': SaleSerializer(recent_sales, many=True).data
        })

class SaleItemViewSet(viewsets.ModelViewSet):
    queryset = SaleItem.objects.all()
    serializer_class = SaleItemSerializer
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['sale', 'product']
