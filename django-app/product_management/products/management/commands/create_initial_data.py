from django.core.management.base import BaseCommand
from django.utils import timezone
from products.models import Category, Product, Customer, Sale, SaleItem
from decimal import Decimal
import random
from datetime import timedelta

class Command(BaseCommand):
    help = 'Creates initial data for the application'

    def handle(self, *args, **options):
        # Create Categories
        categories = [
            {
                'name': '電化製品',
                'description': '家電製品、デジタル機器など'
            },
            {
                'name': '衣類',
                'description': 'メンズ、レディース、キッズの衣類'
            },
            {
                'name': '食品',
                'description': '食料品、飲料、調味料など'
            },
            {
                'name': '家具',
                'description': '家具、インテリア用品'
            },
            {
                'name': '書籍',
                'description': '書籍、雑誌、教材'
            }
        ]

        created_categories = []
        for cat in categories:
            category, created = Category.objects.get_or_create(
                name=cat['name'],
                defaults={'description': cat['description']}
            )
            created_categories.append(category)
            self.stdout.write(self.style.SUCCESS(f'カテゴリー "{cat["name"]}" を作成しました'))

        # Create Products
        products = [
            # 電化製品
            {
                'name': '4Kテレビ 55インチ',
                'description': '高画質4K対応の大型テレビ',
                'category': '電化製品',
                'price': '89800',
                'stock': 15
            },
            {
                'name': '冷蔵庫 500L',
                'description': '大容量両開き冷蔵庫',
                'category': '電化製品',
                'price': '128000',
                'stock': 8
            },
            # 衣類
            {
                'name': 'メンズジャケット',
                'description': 'ビジネスカジュアル対応のジャケット',
                'category': '衣類',
                'price': '12800',
                'stock': 50
            },
            {
                'name': 'レディースワンピース',
                'description': '春夏向けカジュアルワンピース',
                'category': '衣類',
                'price': '6800',
                'stock': 30
            },
            # 食品
            {
                'name': '高級日本茶セット',
                'description': '煎茶、玉露のセット',
                'category': '食品',
                'price': '3800',
                'stock': 100
            },
            {
                'name': '調味料ギフトセット',
                'description': '醤油、味噌、だしの詰め合わせ',
                'category': '食品',
                'price': '4500',
                'stock': 45
            },
            # 家具
            {
                'name': 'ソファーベッド',
                'description': '3人掛け対応のソファーベッド',
                'category': '家具',
                'price': '49800',
                'stock': 12
            },
            {
                'name': 'ダイニングセット',
                'description': 'テーブルと椅子4脚のセット',
                'category': '家具',
                'price': '78000',
                'stock': 8
            },
            # 書籍
            {
                'name': 'プログラミング入門書',
                'description': '初心者向けPython学習書',
                'category': '書籍',
                'price': '2800',
                'stock': 200
            },
            {
                'name': '料理レシピ本',
                'description': '和食の基本レシピ集',
                'category': '書籍',
                'price': '1800',
                'stock': 150
            }
        ]

        created_products = []
        for prod in products:
            category = Category.objects.get(name=prod['category'])
            product, created = Product.objects.get_or_create(
                name=prod['name'],
                defaults={
                    'description': prod['description'],
                    'category': category,
                    'price': Decimal(prod['price']),
                    'stock': prod['stock']
                }
            )
            created_products.append(product)
            self.stdout.write(self.style.SUCCESS(f'製品 "{prod["name"]}" を作成しました'))

        # Create Customers
        customers = [
            {
                'name': '山田太郎',
                'email': 'yamada@example.com',
                'phone': '03-1234-5678',
                'address': '東京都新宿区新宿1-1-1'
            },
            {
                'name': '佐藤花子',
                'email': 'sato@example.com',
                'phone': '03-2345-6789',
                'address': '東京都渋谷区渋谷2-2-2'
            },
            {
                'name': '鈴木一郎',
                'email': 'suzuki@example.com',
                'phone': '03-3456-7890',
                'address': '東京都品川区品川3-3-3'
            },
            {
                'name': '田中美咲',
                'email': 'tanaka@example.com',
                'phone': '03-4567-8901',
                'address': '東京都目黒区目黒4-4-4'
            },
            {
                'name': '伊藤健一',
                'email': 'ito@example.com',
                'phone': '03-5678-9012',
                'address': '東京都港区港5-5-5'
            }
        ]

        created_customers = []
        for cust in customers:
            customer, created = Customer.objects.get_or_create(
                email=cust['email'],
                defaults={
                    'name': cust['name'],
                    'phone': cust['phone'],
                    'address': cust['address']
                }
            )
            created_customers.append(customer)
            self.stdout.write(self.style.SUCCESS(f'顧客 "{cust["name"]}" を作成しました'))

        # Create Sales with focus on last 6 days
        # Map English status to Japanese display text
        status_map = {
            'completed': '完了',
            'pending': '保留中',
            'cancelled': 'キャンセル'
        }
        statuses = ['completed', 'pending', 'cancelled']
        current_time = timezone.now()

        # Create sales for each of the last 6 days
        for day in range(6):
            # Create 3-7 sales per day
            num_sales = random.randint(3, 7)
            for _ in range(num_sales):
                # Set time to current day minus 'day' days, with random hour
                sale_date = current_time - timedelta(
                    days=day,
                    hours=random.randint(0, 23),
                    minutes=random.randint(0, 59)
                )
                
                status = random.choice(statuses)
                customer = random.choice(created_customers)
                
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
                status_jp = status_map[status]
                self.stdout.write(self.style.SUCCESS(
                    f'売上データを作成しました - 顧客: {customer.name}, 状態: {status_jp}, 合計: ¥{total_amount:,.0f}'
                ))

        self.stdout.write('\nすべてのデータが正常に作成されました！')
        self.stdout.write(f'- カテゴリー: {len(created_categories)}件')
        self.stdout.write(f'- 製品: {len(created_products)}件')
        self.stdout.write(f'- 顧客: {len(created_customers)}件')
        total_sales = Sale.objects.count()
        self.stdout.write(f'- 売上: {total_sales}件 (過去6日間)')
