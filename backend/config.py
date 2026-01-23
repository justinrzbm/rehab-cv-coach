"""
Shared configuration for all CV exercises
Adjust these values to optimize performance on your machine
"""

# YOLO Settings
YOLO_IMG_SIZE = 256        # YOLO inference size (lower = faster: 256, 320, 416, 512, 640)
YOLO_CONF = 0.80          # YOLO confidence threshold

# Camera/Processing Settings (for performance)
PROCESSING_WIDTH = 480     # Camera capture resolution width (lower = faster)
PROCESSING_HEIGHT = 360    # Camera capture resolution height (lower = faster)

# Display Settings (for viewing)
DISPLAY_WIDTH = 1920       # Display window width (fullscreen size)
DISPLAY_HEIGHT = 1080      # Display window height (fullscreen size)
FULLSCREEN_WINDOW = True   # Make OpenCV window fullscreen

# UI Colors (BGR format for OpenCV)
UI_TEXT_COLOR = (255, 255, 255)      # White text for high contrast
UI_BG_COLOR = (0, 0, 0)               # Black background
UI_BG_ALPHA = 0.7                     # Background transparency (0=transparent, 1=opaque)

# UI Scale (calculated based on DISPLAY resolution, not processing)
UI_SCALE = min(DISPLAY_WIDTH / 1280.0, DISPLAY_HEIGHT / 720.0)
FONT_SCALE_SMALL = 0.7 * UI_SCALE   # For labels/details
FONT_SCALE_MEDIUM = 1.0 * UI_SCALE  # For HUD/info
FONT_SCALE_LARGE = 1.5 * UI_SCALE   # For big status text
FONT_THICKNESS = max(1, int(2 * UI_SCALE))  # Line thickness