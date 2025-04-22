# Product Management System

A Django-based product management system with a modern UI and REST API endpoints. The system helps manage products, categories, customers, and sales with a clean and responsive dashboard.

## Features

- Modern, responsive dashboard UI using Bootstrap 5
- Real-time sales statistics and charts
- Product management with image support
- Category organization
- Customer tracking
- Sales recording and management
- REST API endpoints for all operations
- Empty state handling for all views
- Image preview before upload
- Form validation
- Low stock alerts
- Mobile-friendly interface

## Prerequisites

- Python 3.8+
- PostgreSQL 12+
- Node.js (for development)

## Installation

1. Clone the repository:
```bash
git clone https://github.com/yourusername/product-management.git
cd product-management
```

2. Create and activate a virtual environment:
```bash
python -m venv venv
source venv/bin/activate  # On Windows: venv\Scripts\activate
```

3. Install dependencies:
```bash
pip install -r requirements.txt
```

4. Configure environment variables:
```bash
cp .env.example .env
# Edit .env with your database credentials and other settings
```

5. Apply migrations:
```bash
python manage.py migrate
```

6. Create a superuser:
```bash
python manage.py createsuperuser
```

## Loading Sample Data

You can load sample data in two ways:

1. Using Django shell:
```bash
python manage.py shell < scripts/insert_dummy_data.py
```

2. Using SQL (for RDS or direct database access):
```bash
psql -U your_username -d your_database -f scripts/insert_dummy_rds.sql
```

## Running the Development Server

```bash
python manage.py runserver
```

Visit http://localhost:8000 in your browser.

## Project Structure

```
product_management/
├── products/
│   ├── templates/
│   │   └── products/
│   │       ├── base.html          # Base template with navigation
│   │       ├── dashboard.html     # Main dashboard
│   │       ├── product_list.html  # Product listing
│   │       └── product_form.html  # Create/Edit product form
│   ├── models.py                  # Database models
│   ├── views.py                   # Views and ViewSets
│   ├── urls.py                    # URL routing
│   └── serializers.py            # API serializers
├── scripts/
│   ├── insert_dummy_data.py      # Python script for sample data
│   └── insert_dummy_rds.sql      # SQL script for sample data
└── manage.py
```

## Available URLs

### Web Interface

- `/` - Dashboard with statistics and charts
- `/products/` - List of all products
- `/products/create/` - Add new product
- `/products/<id>/edit/` - Edit existing product
- `/products/<id>/delete/` - Delete product

### API Endpoints

- `/api/categories/` - Categories CRUD
- `/api/products/` - Products CRUD
- `/api/customers/` - Customers CRUD
- `/api/sales/` - Sales CRUD
- `/api/sale-items/` - Sale items CRUD

Additional API actions:
- `/api/products/low_stock/` - List products with low stock
- `/api/categories/{id}/products/` - List products in category
- `/api/customers/{id}/purchase_history/` - Get customer's purchase history
- `/api/sales/dashboard_stats/` - Get sales dashboard statistics

## UI Features

1. Dashboard
   - Statistics cards for quick overview
   - Sales chart for the last 30 days
   - Top selling products
   - Recent sales
   - Low stock alerts

2. Product Management
   - List view with search and filtering
   - Create/Edit forms with image preview
   - Stock level indicators
   - Bulk actions
   - Pagination

3. Empty States
   - All sections handle empty data gracefully
   - Helpful messages and actions for getting started

4. Responsive Design
   - Works on desktop, tablet, and mobile devices
   - Collapsible sidebar navigation
   - Optimized tables for small screens

## Contributing

1. Fork the repository
2. Create a feature branch
3. Commit your changes
4. Push to the branch
5. Create a Pull Request

## License

This project is licensed under the MIT License - see the LICENSE file for details.
