import os
import re

count = 0
for file in os.listdir('.'):
    if not file.endswith('.html') or file.startswith('_'): continue
    
    with open(file, 'r', encoding='utf-8') as f:
        content = f.read()

    # 1. Navbar
    content = re.sub(
        r'<div style="position: relative; opacity: 0\.5; cursor: not-allowed; display: flex; align-items: center;">(\s*)<span>Academy</span>',
        r'<div style="position: relative; opacity: 0.5; cursor: not-allowed; display: none; align-items: center;">\1<span>Academy</span>',
        content
    )
    
    # 2. Footer variants
    content = re.sub(
        r'<li>(\s*<[^>]*>Academy\s*<[^>]*>Coming</span></span>\s*)</li>',
        r'<li style="display: none;">\1</li>',
        content
    )
    content = re.sub(
        r'<li>(\s*<a[^>]*>Academy </a>\s*)</li>',
        r'<li style="display: none;">\1</li>',
        content
    )
    content = re.sub(
        r'<li>(\s*<span class="nav-item-disabled">Academy </span>\s*)</li>',
        r'<li style="display: none;">\1</li>',
        content
    )
    
    with open(file, 'w', encoding='utf-8') as f:
        f.write(content)
    count += 1
print(f"Updated {count} HTML files to hide Academy.")
