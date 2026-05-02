import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

class EmailService:
    def __init__(self):
        self.smtp_server = "smtp.gmail.com"
        self.smtp_port = 587
        self.sender_email = "vanapalligowtham890@gmail.com"
        self.password = None  # Awaiting App Password from user
        self.receiver_email = "vanapalligowtham890@gmail.com"

    def set_password(self, password):
        self.password = password

    def send_notification(self, subject, body):
        if not self.password:
            print("Email skipped: No password provided.")
            return False
            
        try:
            msg = MIMEMultipart()
            msg['From'] = self.sender_email
            msg['To'] = self.receiver_email
            msg['Subject'] = subject
            
            msg.attach(MIMEText(body, 'plain'))
            
            server = smtplib.SMTP(self.smtp_server, self.smtp_port)
            server.starttls()
            server.login(self.sender_email, self.password)
            server.send_message(msg)
            server.quit()
            return True
        except Exception as e:
            print(f"Error sending email: {e}")
            return False

    def notify_lead_action(self, lead, action):
        subject = f"Lead Matrix Alert: {action['type'].upper()} - {lead['business_name']}"
        body = f"""
New interaction logged for a lead!

Business: {lead['business_name']}
Agent: {action['agent']}
Action: {action['type']}
Notes: {action['note']}
Phone: {lead['phone']}

View details in your dashboard.
        """
        return self.send_notification(subject, body)

# Global instance
email_notify = EmailService()
