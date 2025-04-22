"""
Script to insert dummy data into the database for testing purposes.
Run this script using: python manage.py shell < scripts/insert_dummy_data.py
"""

from django.core.files.uploadedfile import SimpleUploadedFile
from decimal import Decimal
from products.models import Category, Product, Customer, Sale, SaleItem
import random
from datetime import datetime, timedelta

def create_dummy_data():
    # Create Categories
    categories = [
        {
            'name': 'Electronics',
            'description': 'Electronic devices and gadgets'
        },
        {
            'name': 'Clothing',
            'description': 'Fashion apparel and accessories'
        },
        {
            'name': 'Books',
            'description': 'Books and educational materials'
        },
        {
            'name': 'Home & Garden',
            'description': 'Home decor and gardening items'
        },
        {
            'name': 'Sports',
            'description': 'Sports equipment and accessories'
        }
    ]

    created_categories = []
    for cat in categories:
        category, _ = Category.objects.get_or_create(
            name=cat['name'],
            defaults={'description': cat['description']}
        )
        created_categories.append(category)

    # Create Products
    products = [
        {
            'name': 'Smartphone X',
            'description': 'Latest smartphone with advanced features',
            'category': 'Electronics',
            'price': '699.99',
            'stock': 50
        },
        {
            'name': 'Laptop Pro',
            'description': 'High-performance laptop for professionals',
            'category': 'Electronics',
            'price': '1299.99',
            'stock': 25
        },
        {
            'name': 'Classic T-Shirt',
            'description': 'Comfortable cotton t-shirt',
            'category': 'Clothing',
            'price': '19.99',
            'stock': 100
        },
        {
            'name': 'Denim Jeans',
            'description': 'Classic blue denim jeans',
            'category': 'Clothing',
            'price': '49.99',
            'stock': 75
        },
        {
            'name': 'Python Programming',
            'description': 'Comprehensive guide to Python',
            'category': 'Books',
            'price': '39.99',
            'stock': 30
        },
        {
            'name': 'Garden Tools Set',
            'description': 'Complete set of gardening tools',
            'category': 'Home & Garden',
            'price': '89.99',
            'stock': 20
        },
        {
            'name': 'Basketball',
            'description': 'Professional basketball',
            'category': 'Sports',
            'price': '29.99',
            'stock': 40
        }
    ]

    created_products = []
    for prod in products:
        category = Category.objects.get(name=prod['category'])
        product, _ = Product.objects.get_or_create(
            name=prod['name'],
            defaults={
                'description': prod['description'],
                'category': category,
                'price': Decimal(prod['price']),
                'stock': prod['stock']
            }
        )
        created_products.append(product)

    # Create Customers
    customers = [
        {
            'name': 'John Doe',
            'email': 'john@example.com',
            'phone': '123-456-7890',
            'address': '123 Main St, City'
        },
        {
            'name': 'Jane Smith',
            'email': 'jane@example.com',
            'phone': '987-654-3210',
            'address': '456 Oak Ave, Town'
        },
        {
            'name': 'Bob Johnson',
            'email': 'bob@example.com',
            'phone': '555-555-5555',
            'address': '789 Pine Rd, Village'
        }
    ]

    created_customers = []
    for cust in customers:
        customer, _ = Customer.objects.get_or_create(
            email=cust['email'],
            defaults={
                'name': cust['name'],
                'phone': cust['phone'],
                'address': cust['address']
            }
        )
        created_customers.append(customer)

    # Create Sales and Sale Items
    statuses = ['completed', 'pending', 'cancelled']
    
    for _ in range(20):  # Create 20 sales
        customer = random.choice(created_customers)
        status = random.choice(statuses)
        
        # Random date within the last 30 days
        sale_date = datetime.now() - timedelta(days=random.randint(0, 30))
        
        sale = Sale.objects.create(
            customer=customer,
            status=status,
            sale_date=sale_date,
            total_amount=Decimal('0')
        )
        
        # Add 1-5 random products to each sale
        total_amount = Decimal('0')
        for _ in range(random.randint(1, 5)):
            product = random.choice(created_products)
            quantity = random.randint(1, 3)
            
            SaleItem.objects.create(
                sale=sale,
                product=product,
                quantity=quantity,
                unit_price=product.price,
                total_price=product.price * quantity
            )
            
            total_amount += product.price * quantity
        
        sale.total_amount = total_amount
        sale.save()

    print("Dummy data has been successfully inserted into the database!")
    print(f"Created {len(created_categories)} categories")
    print(f"Created {len(created_products)} products")
    print(f"Created {len(created_customers)} customers")
    print(f"Created 20 sales with random items")

if __name__ == '__main__':
    create_dummy_data()
