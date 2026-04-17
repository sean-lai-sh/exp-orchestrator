import sys
from pathlib import Path

# Make `main` importable from the plugin root
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
