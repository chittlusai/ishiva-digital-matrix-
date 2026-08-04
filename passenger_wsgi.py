import sys
import os

# Add the project directory to the sys.path
sys.path.insert(0, os.path.dirname(__file__))

# Import the Flask app object and alias it to 'application' for Passenger
from app import app as application
