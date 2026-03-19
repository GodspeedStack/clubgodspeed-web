import os

html_files = [f for f in os.listdir('.') if f.endswith('.html') and not f.startswith('_')]

for file in html_files:
    if os.path.isfile(file):
        with open(file, 'r', encoding='utf-8') as f:
            content = f.read()

        # Handle the default case
        original_default = '<a href="calendar-preview.html">Calendar</a>'
        new_default = '<a href="calendar-grid.html" class="auth-restricted" style="display: none;">Calendar</a>'
        
        # Handle the active state case (if calendar page was active)
        original_active = '<a href="calendar-preview.html" style="color: #2563eb;">Calendar</a>'
        new_active = '<a href="calendar-grid.html" class="auth-restricted" style="color: #2563eb; display: none;">Calendar</a>'

        if original_default in content or original_active in content:
            new_content = content.replace(original_default, new_default)
            new_content = new_content.replace(original_active, new_active)
            
            with open(file, 'w', encoding='utf-8') as f:
                f.write(new_content)
            print(f"Updated {file}")
