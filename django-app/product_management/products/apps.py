from django.apps import AppConfig

class ProductsConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'products'
    verbose_name = 'Product Management'

    def ready(self):
        """
        Import signal handlers when the app is ready
        """
        # Import signal handlers here if needed in the future
        pass
