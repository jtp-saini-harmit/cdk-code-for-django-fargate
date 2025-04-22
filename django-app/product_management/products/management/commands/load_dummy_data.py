from django.core.management.base import BaseCommand
from scripts.insert_dummy_data import create_dummy_data

class Command(BaseCommand):
    help = 'Load dummy data into the database'

    def handle(self, *args, **kwargs):
        create_dummy_data()
