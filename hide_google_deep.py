import re

# 1. Read the file
with open("index.html", "r") as f:
    content = f.read()

# 2. The Target: Find <a> tags that have "google" in the class, href, OR text.
# This catches <a class="google-btn"> and <a href="google.com">
pattern = re.compile(
    r'(<a[^>]*google[^>]*>.*?</a>|<a[^>]*>.*?google.*?</a>)', 
    re.IGNORECASE | re.DOTALL
)

# 3. The Fix: Wrap matches in comments # We add a check to ensure we don't comment out something that is ALREADY commented.
def hide_match(match):
    text = match.group(1)
    # If it's already wrapped in an HTML comment, leave it unchanged.
    if text.strip().startswith("<!--"):
        return text
    # Otherwise, wrap the matched <a> tag in an HTML comment to hide it.
    return "<!-- " + text + " -->"

new_content, count = pattern.subn(hide_match, content)

# 4. Save
if count > 0:
    with open("index.html", "w") as f:
        f.write(new_content)
    print(f"✅ SUCCESS: Found and hidden {count} Google button(s).")
else:
    print("❌ STILL NOTHING. The button might use an icon code like 'fa-google'.")
    print("   Run this command to see the code manually: grep -n 'Login' index.html")
