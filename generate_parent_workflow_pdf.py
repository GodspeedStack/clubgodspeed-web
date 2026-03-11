from reportlab.lib.pagesizes import letter
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, ListFlowable, ListItem
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.lib import colors

def create_pdf(filename):
    doc = SimpleDocTemplate(filename, pagesize=letter)
    styles = getSampleStyleSheet()
    story = []

    # Custom Styles
    title_style = styles['Title']
    heading_style = styles['Heading2']
    normal_style = styles['Normal']
    code_style = ParagraphStyle('Code', parent=styles['Normal'], fontName='Courier', fontSize=9, backColor=colors.lightgrey)

    # Title
    story.append(Paragraph("Parent Access Workflow & Magic Link Template", title_style))
    story.append(Spacer(1, 12))

    # Section 1: The Workflow
    story.append(Paragraph("1. The Workflow: Connecting Coach to Parent", heading_style))
    story.append(Paragraph("<b>Goal:</b> Securely push player stats to parents without forcing complex logins.", normal_style))
    story.append(Spacer(1, 6))
    
    workflow_steps = [
        "<b>Step 1 (Coach/Admin):</b> Complete training session -> Click 'Share with Parent'.",
        "<b>Step 2 (System):</b> Looks up linked 'Parent Email' -> Generates unique Magic Link.",
        "<b>Step 3 (Parent):</b> Receives email -> Clicks 'View Report'.",
        "<b>Step 4 (Access):</b> Magic Link validates token -> Parent views data instantly."
    ]
    
    # Create a list for workflow
    list_items = [ListItem(Paragraph(step, normal_style)) for step in workflow_steps]
    story.append(ListFlowable(list_items, bulletType='bullet', start='circle'))
    story.append(Spacer(1, 12))

    # Section 2: Email Template
    story.append(Paragraph("2. Magic Link Email Template", heading_style))
    story.append(Paragraph("<b>Subject Line:</b> 🏀 New Training Report: {{Player_Name}} - {{Date}}", normal_style))
    story.append(Spacer(1, 12))
    
    email_body = """
    <b>Headline:</b> Session Complete: {{Session_Focus}}<br/><br/>
    <b>Greeting:</b><br/>
    Hi {{Parent_Name}},<br/><br/>
    Coach {{Coach_Name}} just finished a session with {{Player_Name}} and the results are in! We focused on {{Focus_Area}} today and saw some great improvement in {{Specific_Skill}}.<br/><br/>
    <b>Quick Stat Snapshot:</b><br/>
    • Duration: {{Time_Duration}}<br/>
    • Shooting: {{Shooting_Percentage}}%<br/>
    • Key Win: {{Key_Highlight_Note}}<br/><br/>
    <b>[ BUTTON: View Full Report & Video ]</b><br/>
    (Link: https://app.url/report/{{session_id}}?token={{secure_token}})<br/><br/>
    <b>Security Note:</b><br/>
    For your child's privacy, this report is accessible via the secure link above. This link acts as your password and will expire in 7 days.<br/><br/>
    Best,<br/>
    The {{Team_Name}} Team
    """
    story.append(Paragraph(email_body, normal_style))
    story.append(Spacer(1, 12))

    # Section 3: Technical & UX Logic
    story.append(Paragraph("3. Technical & UX Logic", heading_style))
    
    logic_data = [
        ["Concept", "Detail"],
        ["Magic Link", "Contains a secure, temporary token. No password required."],
        ["Expiration", "Link expires in 7 days. If clicked after, trigger 'Resend Link' flow."],
        ["Security", "Token is one-time use or time-bound. Avoids shared password risks."],
        ["Data Mapping", "Admin must link Parent Email to Player ID during onboarding."]
    ]
    
    t = Table(logic_data, colWidths=[120, 350])
    t.setStyle(TableStyle([
        ('BACKGROUND', (0, 0), (-1, 0), colors.grey),
        ('TEXTCOLOR', (0, 0), (-1, 0), colors.whitesmoke),
        ('ALIGN', (0, 0), (-1, -1), 'LEFT'),
        ('FONTNAME', (0, 0), (-1, 0), 'Helvetica-Bold'),
        ('BOTTOMPADDING', (0, 0), (-1, 0), 12),
        ('BACKGROUND', (0, 1), (-1, -1), colors.beige),
        ('GRID', (0, 0), (-1, -1), 1, colors.black),
    ]))
    story.append(t)

    doc.build(story)

create_pdf("GODSPEED_ParentGuide_PortalAccess_v1.pdf")
