import os
import smtplib
import base64
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

class EmailService:
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        self.sender_email = os.environ.get('GMAIL_SENDER', '')
        self.password = os.environ.get('GMAIL_APP_PASSWORD', '')
        self.receiver_email = os.environ.get('ADMIN_EMAIL', '')

    def set_password(self, password):
        if password:
            self.password = password

    def _make_smtp(self):
        """Create an authenticated SMTP connection."""
        server = smtplib.SMTP(self.smtp_server, self.smtp_port)
        server.starttls()
        server.login(self.sender_email, self.password)
        return server

    def send_notification(self, subject, body):
        if not self.password or not self.sender_email or not self.receiver_email:
            print("Email skipped: Missing environment variables (GMAIL_APP_PASSWORD, GMAIL_SENDER, or ADMIN_EMAIL).")
            return False
        try:
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = self.receiver_email
            msg['Subject'] = subject
            msg.attach(MIMEText(body, 'plain'))
            server = self._make_smtp()
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False

    def send_pdf(self, to_email, subject, body_html, pdf_bytes, pdf_filename):
        """Send an email with a PDF attachment.
        
        Args:
            to_email: recipient email address
            subject: email subject
            body_html: HTML body content
            pdf_bytes: raw PDF bytes (or base64-encoded string)
            pdf_filename: filename for the attachment
        Returns:
            (bool, str): (success, error_message)
        """
        if not self.password or not self.sender_email:
            return False, "Email not configured on server. Set GMAIL_SENDER and GMAIL_APP_PASSWORD in .env"
        try:
            msg = MIMEMultipart('mixed')
            msg['From'] = f"ishiva Lead Matrix Pro <{self.sender_email}>"
            msg['To'] = to_email
            msg['Subject'] = subject

            # HTML body
            alt = MIMEMultipart('alternative')
            alt.attach(MIMEText(body_html, 'html'))
            msg.attach(alt)

            # PDF attachment
            if isinstance(pdf_bytes, str):
                pdf_bytes = base64.b64decode(pdf_bytes)
            part = MIMEBase('application', 'pdf')
            part.set_payload(pdf_bytes)
            encoders.encode_base64(part)
            part.add_header('Content-Disposition', 'attachment', filename=pdf_filename)
            msg.attach(part)

            server = self._make_smtp()
            server.send_message(msg)
            server.quit()
            return True, ""
        except Exception as e:
            print(f"Error sending PDF email: {e}")
            return False, str(e)

    def notify_lead_action(self, lead, action):
        subject = f"Lead Matrix Pro Alert: {action['type'].upper()} - {lead['business_name']}"
        body = f"""
New interaction logged for a lead!

Business: {lead['business_name']}
Agent: {action['agent']}
Action: {action['type']}
Notes: {action['note']}
Phone: {lead.get('phone', 'N/A')}
Status: {lead.get('client_status', 'N/A').upper()}

View details in your ishiva Lead Matrix Pro dashboard.
        """
        return self.send_notification(subject, body)

# Global instance
email_notify = EmailService()

