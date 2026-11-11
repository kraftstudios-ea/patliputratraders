import os
from PIL import Image
import sys

def optimize_image(img_path):
    size_mb = os.path.getsize(img_path) / (1024 * 1024)
    if size_mb < 0.5:
        return
        
    try:
        with Image.open(img_path) as img:
            img.save(img_path, optimize=True)
            new_size_mb = os.path.getsize(img_path) / (1024 * 1024)
            print(f"Compressed {img_path}: {size_mb:.2f}MB -> {new_size_mb:.2f}MB")
    except Exception as e:
        print(f"Failed to process {img_path}: {e}")

public_dir = os.path.abspath(os.path.join(os.getcwd(), '..', 'public'))
print("Scanning:", public_dir)
for root, dirs, files in os.walk(public_dir):
    for f in files:
        if f.lower().endswith(('.png', '.jpg', '.jpeg')):
            optimize_image(os.path.join(root, f))
