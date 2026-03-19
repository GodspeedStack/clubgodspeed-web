import re

with open('calendar-embed.html', 'r', encoding='utf-8') as f:
    text = f.read()

grouped_buttons = '''                <div class=\"calendar-controls\" style=\"display: flex; gap: 0.5rem; align-items: center;\">
                    <button class=\"btn-secondary\" onclick=\"openSyncModal()\"
                        style=\"padding: 0.5rem 1rem; font-size: 0.9rem; display: flex; align-items: center; gap: 6px; white-space: nowrap; background: white !important; color: #1d1d1f !important; border: 1px solid rgba(0,0,0,0.1) !important; border-radius: 8px !important; box-shadow: 0 1px 2px rgba(0,0,0,0.05);\">
                        <svg width=\"14\" height=\"14\" viewBox=\"0 0 24 24\" fill=\"none\" stroke=\"currentColor\" stroke-width=\"2\">
                            <path d=\"M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4\"></path>
                            <polyline points=\"7 10 12 15 17 10\"></polyline>
                            <line x1=\"12\" y1=\"15\" x2=\"12\" y2=\"3\"></line>
                        </svg>
                        Sync
                    </button>
                    <div style=\"display: flex; gap: 0;\">
                        <button class=\"btn-secondary\" onclick=\"prevMonth()\"
                            style=\"padding: 0.5rem 0.8rem; font-size: 0.9rem; background: white !important; color: #1d1d1f !important; border: 1px solid rgba(0,0,0,0.1) !important; border-right: none !important; border-radius: 8px 0 0 8px !important;\">&lt;</button>
                        <button class=\"btn-secondary\" onclick=\"gotoToday()\"
                            style=\"padding: 0.5rem 1rem; font-size: 0.9rem; background: white !important; color: #1d1d1f !important; border: 1px solid rgba(0,0,0,0.1) !important; border-radius: 0 !important;\">Today</button>
                        <button class=\"btn-secondary\" onclick=\"nextMonth()\"
                            style=\"padding: 0.5rem 0.8rem; font-size: 0.9rem; background: white !important; color: #1d1d1f !important; border: 1px solid rgba(0,0,0,0.1) !important; border-left: none !important; border-radius: 0 8px 8px 0 !important;\">&gt;</button>
                    </div>
                </div>'''

pattern = r'<div class=\"calendar-controls\">.*?</div>\s*</div>\s*<!-- Headers -->'
replacement = grouped_buttons + '\n            </div>\n\n            <!-- Headers -->'
text = re.sub(pattern, replacement, text, flags=re.DOTALL)

pattern2 = r'<div class=\"calendar-controls\">.*?</div>\s*</div>\s*<!-- Import Section -->'
replacement2 = grouped_buttons + '\n            </div>\n\n            <!-- Import Section -->'
text = re.sub(pattern2, replacement2, text, flags=re.DOTALL)

with open('calendar-embed.html', 'w', encoding='utf-8') as f:
    f.write(text)

with open('parent-portal.html', 'r', encoding='utf-8') as f:
    pp = f.read()

pp = pp.replace('src=\"calendar-embed.html\"', 'src=\"calendar-embed.html?v=3\"')
pp = pp.replace('src=\"calendar-embed.html?v=2\"', 'src=\"calendar-embed.html?v=3\"')

with open('parent-portal.html', 'w', encoding='utf-8') as f:
    f.write(pp)
print('Execution Completed')
