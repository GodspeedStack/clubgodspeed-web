import re

# 1. Read the file
with open("index.html", "r") as f:
    content = f.read()

# 2. The Target: Find the Google button (if it's not already hidden)
# We look for the anchor tag <a> that contains "Google"
pattern = re.compile(
    r'(<a[^>]*>.*?Google.*?</a>)', 
    re.IGNORECASE | re.DOTALL
)

# 3. The Action: Wrap it in invisible tags ()
# This keeps the code saved, just hidden from view.
if "', content)

# 4. Save
if count > 0:
    with open("index.html", "w") as f:
        f.write(new_content)
    print(f"✅ SUCCESS: The Google button is now hidden (but safely saved in the code).")
else:
    print("ℹ️ STATUS: Could not find an active Google button (it might already be hidden).")
