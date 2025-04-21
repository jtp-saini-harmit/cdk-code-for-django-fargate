from django.db import models
from django.utils import timezone


class Product(models.Model):
    """製品モデル"""

    name = models.CharField("製品名", max_length=200)
    code = models.CharField("製品コード", max_length=50, unique=True)
    description = models.TextField("説明", blank=True)
    created_at = models.DateTimeField("作成日時", default=timezone.now)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    def __str__(self):
        return f"{self.code}: {self.name}"

    class Meta:
        verbose_name = "製品"
        verbose_name_plural = "製品"


class Process(models.Model):
    """工程モデル"""

    name = models.CharField("工程名", max_length=100)
    description = models.TextField("説明", blank=True)
    standard_time = models.IntegerField("標準時間(分)", default=0)
    created_at = models.DateTimeField("作成日時", default=timezone.now)

    def __str__(self):
        return self.name

    class Meta:
        verbose_name = "工程"
        verbose_name_plural = "工程"


class ProductionOrder(models.Model):
    """製造指示モデル"""

    STATUS_CHOICES = [
        ("planned", "計画済"),
        ("in_progress", "製造中"),
        ("completed", "完了"),
        ("canceled", "中止"),
    ]

    product = models.ForeignKey(Product, on_delete=models.PROTECT, verbose_name="製品")
    process = models.ForeignKey(Process, on_delete=models.PROTECT, verbose_name="工程")
    quantity = models.IntegerField("数量")
    planned_date = models.DateField("計画日")
    status = models.CharField(
        "状態", max_length=20, choices=STATUS_CHOICES, default="planned"
    )
    notes = models.TextField("備考", blank=True)
    created_at = models.DateTimeField("作成日時", default=timezone.now)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    def __str__(self):
        return f"{self.product.name} - {self.quantity}個 ({self.planned_date})"

    class Meta:
        verbose_name = "製造指示"
        verbose_name_plural = "製造指示"


class Inventory(models.Model):
    """在庫モデル"""

    product = models.ForeignKey(Product, on_delete=models.PROTECT, verbose_name="製品")
    quantity = models.IntegerField("数量")
    location = models.CharField("保管場所", max_length=100)
    updated_at = models.DateTimeField("更新日時", auto_now=True)

    def __str__(self):
        return f"{self.product.name} - {self.quantity}個 ({self.location})"

    class Meta:
        verbose_name = "在庫"
        verbose_name_plural = "在庫"
