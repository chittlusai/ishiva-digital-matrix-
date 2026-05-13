# ishiva Digital technologies - Google Maps Lead Scraper
# Requirements: pip install selenium pandas gspread google-auth

import selenium
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.common.exceptions import TimeoutException, NoSuchElementException
import time
import pandas as pd
from datetime import datetime
import random
import os
import re

# ===================== CONFIGURATION =====================

LOCATIONS = {
    "India": [
        "Mumbai", "Delhi", "Bangalore", "Chennai", "Hyderabad",
        "Pune", "Kolkata", "Jaipur", "Ahmedabad", "Lucknow",
        "Andhra Pradesh", "Telangana", "Kerala", "Maharashtra",
        "Gujarat", "Tamil Nadu", "Karnataka", "Uttar Pradesh"
    ],
    "USA": [
        "New York", "Los Angeles", "Chicago", "Houston", "Phoenix",
        "Philadelphia", "San Antonio", "San Diego", "Dallas", "Miami",
        "California", "Texas", "Florida", "New Jersey", "Illinois"
    ]
}

CATEGORIES = {
    "Restaurants": ["restaurants", "food", "cafe", "bakery", "pizza"],
    "Salons & Spas": ["salon", "spa", "beauty parlour", "hair salon", "gym"],
    "Retail Shops": ["shop", "store", "retail", "clothing", "electronics"],
    "Services": ["plumber", "electrician", "contractor", "cleaning"],
    "Business": ["business", "company", "consulting", "agency"],
    "Hotels": ["hotel", "resort", "guest house", "lodging"],
    "Healthcare": ["clinic", "hospital", "doctor", "pharmacy", "medical"],
    "Education": ["school", "college", "tuition", "coaching"],
    "Real Estate": ["real estate", "property", "builders", "agents"],
    "Auto": ["car showroom", "bike", "auto repair", "garage"]
}

OUTPUT_FILE = f"leads_shiva_digital_{datetime.now().strftime('%Y%m%d_%H%M')}.csv"

class GoogleMapsScraper:
    def __init__(self):
        self.driver = None
        self.leads = []

    def setup_driver(self):
        """Setup Chrome driver with options"""
        chrome_options = Options()
        chrome_options.add_argument("--headless=new")
        chrome_options.add_argument("--no-sandbox")
        chrome_options.add_argument("--disable-dev-shm-usage")
        chrome_options.add_argument("--disable-gpu")
        chrome_options.add_argument("--window-size=1920,1080")
        chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36")

        self.driver = webdriver.Chrome(options=chrome_options)
        self.driver.maximize_window()
        self.driver.set_page_load_timeout(45)

    def search_google_maps(self, query, location):
        """Search for businesses on Google Maps"""
        search_query = f"{query} in {location}".replace(" ", "+")
        search_url = f"https://www.google.com/maps/search/{search_query}"
        print(f"[*] Searching: {search_url}")
        self.driver.get(search_url)
        time.sleep(random.uniform(4, 6))

    def extract_business_details(self, location, category, country, limit=20):
        """Streaming generator that yields leads as they are found"""
        try:
            yield {"status": f"Searching for {category} in {location}..."}
            self.search_google_maps(category, location)
            
            extracted_names = set()
            found_count = 0
            scroll_attempts = 0
            max_scroll_attempts = 40 # High limit support
            
            while found_count < limit and scroll_attempts < max_scroll_attempts:
                # Get current visible listings
                selectors = [".Nv2PK", "div[role='article']", "a[href*='/maps/place']"]
                listings = []
                for s in selectors:
                    listings = self.driver.find_elements(By.CSS_SELECTOR, s)
                    if listings: break
                
                if not listings:
                    yield {"status": f"Scanning for results (attempt {scroll_attempts+1})..."}
                    time.sleep(2)
                    scroll_attempts += 1
                    continue

                for listing in listings:
                    if found_count >= limit: break
                    try:
                        card_text = listing.text
                        anchor = listing.find_element(By.CSS_SELECTOR, "a[href*='/maps/place'], a.hfpxzc")
                        name = anchor.get_attribute("aria-label")
                        href = anchor.get_attribute("href")
                        
                        if not name or name == "N/A":
                            name = card_text.split('\n')[0] if card_text else "N/A"
                        
                        if name in extracted_names: continue
                        extracted_names.add(name)
                        
                        lead = {
                            "business_name": name, "category": category, "location": location,
                            "country": country, "date_scraped": datetime.now().strftime("%Y-%m-%d"),
                            "phone": "N/A", "website": "N/A", "email": "N/A",
                            "rating": "N/A", "reviews": "N/A", "hours": "N/A"
                        }
                        
                        if href:
                            self.driver.execute_script("window.open(arguments[0], '_blank');", href)
                            self.driver.switch_to.window(self.driver.window_handles[-1])
                            time.sleep(random.uniform(1.5, 2.5))
                            
                            try:
                                body_src = self.driver.find_element(By.TAG_NAME, "body").text.replace('\n', ' ')
                                try:
                                    web_node = self.driver.find_element(By.CSS_SELECTOR, "a[data-item-id='authority']")
                                    lead['website'] = web_node.get_attribute("href")
                                except: pass
                                
                                try:
                                    ph_node = self.driver.find_element(By.CSS_SELECTOR, "button[data-item-id*='phone:tel:']")
                                    lead['phone'] = ph_node.get_attribute("data-item-id").split(':')[-1]
                                except:
                                    p_match = re.search(r'(\+?\d[\d\s.-]{8,})', body_src)
                                    if p_match: lead['phone'] = p_match.group(1).strip()
                                
                                rr_match = re.search(r'(\d[.,]\d)\s*\(([\d.,K]+)\)', body_src)
                                if rr_match:
                                    lead['rating'] = rr_match.group(1)
                                    lead['reviews'] = rr_match.group(2)
                                
                                br_match = re.search(r'(Open.*?Closes.*?|Closed.*?Opens.*?|Open 24 hours)', body_src, re.I)
                                if br_match: lead['hours'] = br_match.group(1)

                                # Attempt Email Extraction
                                e_match = re.search(r'[\w\.-]+@[\w\.-]+\.\w+', body_src)
                                if e_match: lead['email'] = e_match.group(0)
                            except: pass
                            
                            self.driver.close()
                            self.driver.switch_to.window(self.driver.window_handles[0])
                        
                        lead['has_website'] = "Yes" if lead['website'] != "N/A" else "No"
                        lead['priority'] = "🔥 HIGH" if lead['website'] == "N/A" else "🟡 MEDIUM"
                        lead['lead_status'] = "New Lead"
                        lead['notes'] = ""
                        
                        found_count += 1
                        yield {"status": f"Extracted {found_count}/{limit} leads..."}
                        yield lead
                    except:
                        if len(self.driver.window_handles) > 1:
                            self.driver.close()
                            self.driver.switch_to.window(self.driver.window_handles[0])
                        continue

                # Scroll to reveal more
                if found_count < limit:
                    try:
                        feed = self.driver.find_element(By.CSS_SELECTOR, "div[role='feed']")
                        self.driver.execute_script("arguments[0].scrollTop = arguments[0].scrollHeight", feed)
                        yield {"status": f"Scrolling... found {found_count} leads so far"}
                        print(f"   Scrolled. Leads found: {found_count}")
                    except:
                        self.driver.execute_script("window.scrollTo(0, document.body.scrollHeight)")
                        yield {"status": f"Scrolling... found {found_count} leads so far"}
                    time.sleep(3)
                    scroll_attempts += 1
                else: break
        except Exception as e:
            print(f"[!] Scraper Error: {e}")
        finally:
            print(f"[*] Stream finished. Total: {found_count}")

    def save_to_csv(self, leads):
        """Helper to save to CSV for local use"""
        if leads:
            df = pd.DataFrame(leads)
            df.to_csv(OUTPUT_FILE, index=False)
            return OUTPUT_FILE
        return None

if __name__ == "__main__":
    # Local CLI bypass
    scraper = GoogleMapsScraper()
    scraper.setup_driver()
    try:
        results = []
        for lead in scraper.extract_business_details("Bangalore", "Restaurants", "India", 5):
            results.append(lead)
            print(f"   [Streaming] Found: {lead['business_name']}")
        scraper.save_to_csv(results)
    finally:
        scraper.driver.quit()