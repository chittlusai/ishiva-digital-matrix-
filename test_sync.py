from sheets_integration import sheets_sync
import json

# Set your sheet ID
sheets_sync.set_spreadsheet_id('1tzIXL301KT6tejFwjWmkHoIY-tu7IUEiOItBtobJp3k')

print(f"Testing connection to Sheet ID: {sheets_sync.spreadsheet_id}")

test_lead = {
    "business_name": "TEST CONNECTION",
    "phone": "1234567890",
    "website": "http://test.com",
    "email": "test@test.com",
    "category": "Testing",
    "location": "Global",
    "rating": "5.0",
    "reviews": "100",
    "priority": "high",
    "agent": "System",
    "client_status": "testing",
    "date_scraped": "2026-05-01",
    "notes": "Testing the sync logic"
}

try:
    success = sheets_sync.sync_lead(test_lead)
    if success:
        print("✅ SUCCESS! Check your Google Sheet now.")
    else:
        print("❌ FAILED! The sync_lead function returned False.")
except Exception as e:
    print(f"💥 CRASHED! Error: {e}")
