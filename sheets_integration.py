import os
from google.oauth2 import service_account
from googleapiclient.discovery import build

class SheetsService:
    def __init__(self):
        self.scopes = ['https://www.googleapis.com/auth/spreadsheets']
        self.service = None
        self.spreadsheet_id = os.environ.get('SHEETS_SPREADSHEET_ID', '')
        
        # Fallback raw key if not in ENV
        default_raw_key = ("MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQC8G4e7UpJdLHpl"
                   "+arKyKbhEuqaaJGNNCMODei1QwQS71DjSGZcEIe3X6I5DwxqdPCZBzZaj84fsEwl"
                   "bGz+C7Os0P7zuOtOrhgbp4e2t1CcWltlmy8FpmzIzSL9OSGKIsY9kIbOaSnu7EoX"
                   "FdWrxSS1mCsROVD2na2lMDK9dNSjFr342m5mN+VJgTnRqNDW0krWztMSBCsNlKBN"
                   "uA08ka2WvBGY2cjY1jQAdTE9sfJTYXdxMo5CfvAVc90OHl7deNumvJrqNYXVRTPh"
                   "GO5nJ1DkgbW85YgAdqkcpsMxmugWxrP/kPAQwfoNdeNpfxOYn8deqqIiVzaFpYIN"
                   "77E8g6ZhAgMBAAECggEAGNhKBSPS0Ruezvk65a263N9yvRIyp0PLnX+YzNgdIaMa"
                   "O+rEGkTUqBOpiX/DVAw9+vhI5Y043FacuBSqEKPbB2hTRD2YVrwH0x89fZSYwQ3u"
                   "JG1quIRSufLePDPfii8tn9QG+hxJvZTX9FSd9CIFxzZh+dRoLSqGVNsY2I0lyKRu"
                   "WwL/78YngpedvCKn0Lk86PgZjrLMSyoKH8/Gt5U6XSqyMBMtw3iKLysH0wT5IMjD"
                   "mHgNNx0rYB3A5vVTATXTty8pRsmEIcA3Tqjk7xOizhSG/GYlZCBDcu6tg9XE7Dqm"
                   "fUCdGaQzbbqntEGIdxzPUTDDyzqWF7hDKSATfBSMQQKBgQDcSXrhNOMFrV/0KiSY"
                   "tPe5YkX69uLq+8ilduSluk1LP225wx+m2ZzumLZfiJrjq7aH0NUDEJ6FVb2CmoBd"
                   "sZoui9kB8uogzaX2kb8uSV8PP4xaPwBbmCLTNaUz5v+5BxpFhSbPMnZwgkDBSmAy"
                   "mY5GwJTpmRKGY4dnDAdb7428IwKBgQDamoMw1kwj9wKBKpSqEq4oVwxRhEmexPOS"
                   "cb3q1xbmStptwbGt3enX3l0iNWvfo1pc5g3g3klkrXX34xuUnaY4UEZ7c6m2Fime"
                   "WUgix2gkQV67DOLBKTmV7RhCjx9rkkntD7wonAJHPS/EdepzbpZH5JbBpTwhoe39"
                   "oM5oV5tJqwKBgG5WN8A5t0SOtLMdsLr0Weh3Osobg0lj1/pY9Om1ySVZneIfw+jU"
                   "svAneaGcUMicp46boTYpytzKN2QFcyp63NlXntiFDZRkrS41jmbmxUBj+i7xw4Id"
                   "T8Qu6JJ4r7nDvvr3WJsLkZuFAl5OnKR7mXIC4BOpYkgB7j5FHiKEeJ+1AoGAfPUR"
                   "xNrajzxlLByA+m7PKrQHkJlD1APVD4MBArqMlnt3PIIZ5L8TKpgrOKC81wtzXeML"
                   "T90AqxIUeuxRGbS8DTil8W9+NV2Z0LBMccT2nLLZSabl/3BnQHJVCcbyOPVYWLBD"
                   "6Bq1mq85HN4idHVkZhgerPac1sTPW8mN80sQsx0CgYEAif/2NLGM9b3onv55Ib4E"
                   "bAOrXYbhrOoJ55joS6DkSNghS18f44u5XMmfLKUdaE3fU3ECJrwdy71Ly6KxWuPx"
                   "zPq6KdrdVrehnyBJST43fBvxzSElOHdbEfobmXyHy5aPcbM3eVnJGTOGm0nA4Jua"
                   "Zk42p6ki6NZmvhffg7LWq+0=")
        
        raw_key = os.environ.get('GOOGLE_PRIVATE_KEY', default_raw_key)
        client_email = os.environ.get('GOOGLE_CLIENT_EMAIL', 'lead-matrix-pro@lead-matrix-pro.iam.gserviceaccount.com')
        project_id = os.environ.get('GOOGLE_PROJECT_ID', 'lead-matrix-pro')
        
        # Reconstruct the PEM format correctly
        pem_key = f"-----BEGIN PRIVATE KEY-----\n{raw_key}\n-----END PRIVATE KEY-----\n"
        
        info = {
            "type": "service_account",
            "project_id": project_id,
            "private_key": pem_key,
            "client_email": client_email,
            "token_uri": "https://oauth2.googleapis.com/token"
        }

        try:
            creds = service_account.Credentials.from_service_account_info(info, scopes=self.scopes)
            self.service = build('sheets', 'v4', credentials=creds)
        except Exception as e:
            print(f"Error initializing Sheets Service: {e}")

    def set_spreadsheet_id(self, url_or_id):
        if not url_or_id:
            return
        if 'docs.google.com/spreadsheets/d/' in url_or_id:
            self.spreadsheet_id = url_or_id.split('/d/')[1].split('/')[0]
        else:
            self.spreadsheet_id = url_or_id

    def sync_lead(self, lead):
        if not self.service or not self.spreadsheet_id:
            return False
            
        try:
            # Check if sheet has headers
            range_name = 'Sheet1!A1'
            result = self.service.spreadsheets().values().get(
                spreadsheetId=self.spreadsheet_id, range=range_name).execute()
            
            if not result.get('values'):
                headers = [
                    'Business Name', 'Phone', 'Website', 'Email', 'Category', 
                    'Location', 'Rating', 'Reviews', 'Priority', 'Agent', 
                    'Status', 'Last Contact', 'Notes'
                ]
                self.service.spreadsheets().values().update(
                    spreadsheetId=self.spreadsheet_id, range='Sheet1!A1',
                    valueInputOption='RAW', body={'values': [headers]}).execute()
                
                # Apply Claude-style formatting to headers
                self.service.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body={
                    "requests": [
                        {
                            "repeatCell": {
                                "range": {"sheetId": 0, "startRowIndex": 0, "endRowIndex": 1},
                                "cell": {
                                    "userEnteredFormat": {
                                        # Claude Coral color (#D97757) -> RGB (217, 119, 87) -> (0.85, 0.46, 0.34)
                                        "backgroundColor": {"red": 0.85, "green": 0.46, "blue": 0.34},
                                        "textFormat": {"foregroundColor": {"red": 1, "green": 1, "blue": 1}, "bold": True},
                                        "horizontalAlignment": "CENTER"
                                    }
                                },
                                "fields": "userEnteredFormat(backgroundColor,textFormat,horizontalAlignment)"
                            }
                        },
                        {"updateSheetProperties": {"properties": {"sheetId": 0, "gridProperties": {"frozenRowCount": 1}}, "fields": "gridProperties.frozenRowCount"}}
                    ]
                }).execute()

            # Append lead data
            values = [[
                lead.get('business_name', lead.get('name', '')),
                lead.get('phone', ''),
                lead.get('website', ''),
                lead.get('email', 'N/A'),
                lead.get('category', ''),
                lead.get('location', ''),
                lead.get('rating', '0'),
                lead.get('reviews', '0'),
                lead.get('priority', 'medium'),
                lead.get('agent', 'System'),
                lead.get('client_status', 'new'),
                lead.get('date_scraped', ''),
                lead.get('notes', '')
            ]]
            
            self.service.spreadsheets().values().append(
                spreadsheetId=self.spreadsheet_id, range='Sheet1!A1',
                valueInputOption='RAW', body={'values': values}).execute()
            
            # Auto-resize columns
            self.service.spreadsheets().batchUpdate(spreadsheetId=self.spreadsheet_id, body={
                "requests": [{"autoResizeDimensions": {"dimensions": {"sheetId": 0, "dimension": "COLUMNS", "startIndex": 0, "endIndex": 13}}}]
            }).execute()
            
            return True
        except Exception as e:
            print(f"Error syncing to Sheets: {e}")
            return False

# Global instance
sheets_sync = SheetsService()
