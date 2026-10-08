from datetime import datetime
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.pagesizes import letter
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib.units import inch
from reportlab.platypus import Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle


def build_pdf_report(fos: float, category: str, risk: int, sensors: list[dict]) -> bytes:
    output = BytesIO()
    document = SimpleDocTemplate(output, pagesize=letter, rightMargin=0.65 * inch, leftMargin=0.65 * inch)
    styles = getSampleStyleSheet()
    story = [
        Paragraph("SMART SLOPE", styles["Title"]),
        Paragraph("Stability monitoring engineering summary", styles["Heading2"]),
        Paragraph(f"Himalayan Field Study · Generated {datetime.now().strftime('%Y-%m-%d %H:%M')}", styles["Normal"]),
        Spacer(1, 18),
    ]
    summary = Table([
        ["Factor of safety", "Current condition", "Model-based risk"],
        [f"{fos:.2f}", category, f"{risk}%"],
    ], colWidths=[2.25 * inch] * 3)
    summary.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#eaf2ee")),
        ("TEXTCOLOR", (0, 0), (-1, 0), colors.HexColor("#40534f")),
        ("TEXTCOLOR", (0, 1), (-1, 1), colors.HexColor("#145a8d")),
        ("FONTNAME", (0, 0), (-1, -1), "Helvetica"),
        ("FONTSIZE", (0, 0), (-1, 0), 9),
        ("FONTSIZE", (0, 1), (-1, 1), 15),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 10),
        ("TOPPADDING", (0, 0), (-1, -1), 10),
        ("GRID", (0, 0), (-1, -1), 0.5, colors.HexColor("#dce5e2")),
    ]))
    story.extend([summary, Spacer(1, 18), Paragraph("Sensor summary", styles["Heading2"])])
    readings = [["Instrument", "Latest reading"]] + [[item["name"], f"{item['value']} {item['unit']}"] for item in sensors]
    sensor_table = Table(readings, colWidths=[3.4 * inch, 3.35 * inch], repeatRows=1)
    sensor_table.setStyle(TableStyle([
        ("BACKGROUND", (0, 0), (-1, 0), colors.HexColor("#f4f7f5")),
        ("GRID", (0, 0), (-1, -1), 0.4, colors.HexColor("#dce5e2")),
        ("FONTSIZE", (0, 0), (-1, -1), 9),
        ("LEFTPADDING", (0, 0), (-1, -1), 8),
        ("TOPPADDING", (0, 0), (-1, -1), 7),
        ("BOTTOMPADDING", (0, 0), (-1, -1), 7),
    ]))
    story.extend([sensor_table, Spacer(1, 18), Paragraph("Engineering interpretation", styles["Heading2"])])
    story.append(Paragraph(
        f"Current monitoring indicators suggest a {category.lower()} condition. Interpret rainfall, pore pressure and movement together with a site-specific geotechnical model and qualified engineering review.",
        styles["BodyText"],
    ))
    story.extend([Spacer(1, 12), Paragraph("Limitations and disclaimer", styles["Heading2"])])
    story.append(Paragraph(
        "Academic demonstration model. Not a substitute for site-specific geotechnical design, field inspection, or professional engineering judgement. Project classification thresholds are illustrative only.",
        styles["BodyText"],
    ))
    document.build(story)
    return output.getvalue()