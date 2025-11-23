from fpdf import FPDF
import os

class Auditor:
    def generate_report(self, profile, duplicates_count, estimated_savings, output_path="audit_report.pdf"):
        pdf = FPDF()
        pdf.add_page()
        
        # Title
        pdf.set_font("Arial", "B", 24)
        pdf.cell(0, 20, "Entify Data Audit Report", ln=True, align="C")
        
        # Summary
        pdf.set_font("Arial", "", 12)
        pdf.ln(10)
        pdf.cell(0, 10, f"Total Records: {profile['total_rows']}", ln=True)
        pdf.cell(0, 10, f"Duplicate Records Found: {duplicates_count}", ln=True)
        pdf.cell(0, 10, f"Duplicate Rate: {(duplicates_count / profile['total_rows'] * 100):.1f}%", ln=True)
        
        # Savings
        pdf.set_font("Arial", "B", 16)
        pdf.ln(10)
        pdf.set_text_color(0, 128, 0)
        pdf.cell(0, 10, f"Estimated Waste / Savings: ${estimated_savings:,.2f}", ln=True)
        
        # Reset color
        pdf.set_text_color(0, 0, 0)
        
        # Details
        pdf.ln(10)
        pdf.set_font("Arial", "B", 14)
        pdf.cell(0, 10, "Column Quality Metrics", ln=True)
        pdf.set_font("Arial", "", 10)
        
        for col in profile['columns']:
            pdf.cell(0, 8, f"{col['column']}: {col['null_percentage']:.1f}% Nulls, {col['unique_count']} Unique Values", ln=True)
            
        pdf.output(output_path)
        return output_path

# Example usage
if __name__ == "__main__":
    auditor = Auditor()
    profile = {
        'total_rows': 50000,
        'columns': [
            {'column': 'name', 'null_percentage': 0.5, 'unique_count': 42100},
            {'column': 'city', 'null_percentage': 1.2, 'unique_count': 500}
        ]
    }
    auditor.generate_report(profile, 7900, 140000)
