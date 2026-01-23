"""
UI utility functions for drawing text with backgrounds
"""
import cv2
import numpy as np
from config import UI_TEXT_COLOR, UI_BG_COLOR, UI_BG_ALPHA

def draw_text_with_bg(frame, text, pos, font_scale, thickness, text_color=None, bg_color=None, alpha=None):
    """
    Draw text with a semi-transparent background for better readability
    
    Args:
        frame: The image to draw on (will be modified in place)
        text: Text to display
        pos: (x, y) position tuple
        font_scale: Font scale
        thickness: Text thickness
        text_color: Text color (BGR), defaults to UI_TEXT_COLOR
        bg_color: Background color (BGR), defaults to UI_BG_COLOR
        alpha: Background alpha (0-1), defaults to UI_BG_ALPHA
    """
    if text_color is None:
        text_color = UI_TEXT_COLOR
    if bg_color is None:
        bg_color = UI_BG_COLOR
    if alpha is None:
        alpha = UI_BG_ALPHA
    
    x, y = pos
    font = cv2.FONT_HERSHEY_SIMPLEX
    
    # Get text size
    (text_width, text_height), baseline = cv2.getTextSize(text, font, font_scale, thickness)
    
    # Draw background rectangle with padding
    padding = int(5 * font_scale)
    bg_x1 = max(0, x - padding)
    bg_y1 = max(0, y - text_height - padding)
    bg_x2 = min(frame.shape[1], x + text_width + padding)
    bg_y2 = min(frame.shape[0], y + baseline + padding)
    
    # Create semi-transparent background
    overlay = frame.copy()
    cv2.rectangle(overlay, (bg_x1, bg_y1), (bg_x2, bg_y2), bg_color, -1)
    cv2.addWeighted(overlay, alpha, frame, 1 - alpha, 0, frame)
    
    # Draw text
    cv2.putText(frame, text, (x, y), font, font_scale, text_color, thickness, cv2.LINE_AA)