import os
import environ

env = environ.Env()

def get_database_config():
    """
    Get database configuration from environment variables.
    Falls back to SQLite for local development if environment variables are not set.
    """
    if os.environ.get('DATABASE_HOST'):
        return {
            'default': {
                'ENGINE': 'django.db.backends.postgresql',
                'NAME': env('DATABASE_NAME'),
                'USER': env('DATABASE_USER'),
                'PASSWORD': env('DATABASE_PASSWORD'),
                'HOST': env('DATABASE_HOST'),
                'PORT': env('DATABASE_PORT', default='5432'),
                'ATOMIC_REQUESTS': True,
                'CONN_MAX_AGE': 60,
                'OPTIONS': {
                    'connect_timeout': 10,
                }
            }
        }
    
    # Fallback to SQLite for local development
    BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
    return {
        'default': {
            'ENGINE': 'django.db.backends.sqlite3',
            'NAME': os.path.join(BASE_DIR, 'db.sqlite3'),
        }
    }
