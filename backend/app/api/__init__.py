"""HTTP layer: one blueprint per §18 section."""
from .analyses import bp as analyses_bp
from .auth import bp as auth_bp
from .models import bp as models_bp
from .photos import bp as photos_bp
from .reports import bp as reports_bp
from .sectors import bp as sectors_bp
from .sensors import bp as sensors_bp

BLUEPRINTS = (auth_bp, sectors_bp, analyses_bp, reports_bp, models_bp, photos_bp, sensors_bp)
