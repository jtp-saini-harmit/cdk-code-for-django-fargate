from django.urls import path, include
from rest_framework.routers import DefaultRouter
from .views import (
    CategoryViewSet, ProductViewSet, CustomerViewSet,
    SaleViewSet, SaleItemViewSet, DashboardView,
    ProductListView, ProductCreateView, ProductUpdateView,
    ProductDeleteView, CategoryListView, CategoryCreateView,
    CategoryUpdateView, CategoryDeleteView, CustomerListView,
    CustomerCreateView, CustomerUpdateView, CustomerDeleteView,
    SaleListView
)

app_name = 'products'

# API Routes
router = DefaultRouter()
router.register(r'categories', CategoryViewSet)
router.register(r'products', ProductViewSet)
router.register(r'customers', CustomerViewSet)
router.register(r'sales', SaleViewSet)
router.register(r'sale-items', SaleItemViewSet)

urlpatterns = [
    # Template Views
    path('', DashboardView.as_view(), name='dashboard'),
    # Product URLs
    path('products/', ProductListView.as_view(), name='product_list'),
    path('products/create/', ProductCreateView.as_view(), name='product_create'),
    path('products/<int:pk>/edit/', ProductUpdateView.as_view(), name='product_edit'),
    path('products/<int:pk>/delete/', ProductDeleteView.as_view(), name='product_delete'),
    
    # Category URLs
    path('categories/', CategoryListView.as_view(), name='category_list'),
    path('categories/create/', CategoryCreateView.as_view(), name='category_create'),
    path('categories/<int:pk>/edit/', CategoryUpdateView.as_view(), name='category_edit'),
    path('categories/<int:pk>/delete/', CategoryDeleteView.as_view(), name='category_delete'),
    
    # Customer URLs
    path('customers/', CustomerListView.as_view(), name='customer_list'),
    path('customers/create/', CustomerCreateView.as_view(), name='customer_create'),
    path('customers/<int:pk>/edit/', CustomerUpdateView.as_view(), name='customer_edit'),
    path('customers/<int:pk>/delete/', CustomerDeleteView.as_view(), name='customer_delete'),
    
    # Sale URLs
    path('sales/', SaleListView.as_view(), name='sale_list'),
    
    # API Routes
    path('api/', include(router.urls)),
]

# Available API endpoints:
# /api/categories/ - List and create categories
# /api/categories/{id}/ - Retrieve, update, delete category
# /api/categories/{id}/products/ - List products in category

# /api/products/ - List and create products
# /api/products/{id}/ - Retrieve, update, delete product
# /api/products/low_stock/ - List products with low stock

# /api/customers/ - List and create customers
# /api/customers/{id}/ - Retrieve, update, delete customer
# /api/customers/{id}/purchase_history/ - Get customer's purchase history

# /api/sales/ - List and create sales
# /api/sales/{id}/ - Retrieve, update, delete sale
# /api/sales/dashboard_stats/ - Get sales dashboard statistics

# /api/sale-items/ - List and create sale items
# /api/sale-items/{id}/ - Retrieve, update, delete sale item

# Available template views:
# / - Dashboard view
# /products/ - Product list view
# /products/create/ - Create new product
# /products/<id>/edit/ - Edit existing product
# /products/<id>/delete/ - Delete product
