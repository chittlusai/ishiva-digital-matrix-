import time
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.chrome.options import Options
from scraper import GoogleMapsScraper
import json

if __name__ == "__main__":
    print("Starting e2e test...")
    scraper = GoogleMapsScraper()
    try:
        scraper.setup_driver()
        scraper.extract_business_details("Mumbai", "Restaurants", "India")
        leads = scraper.leads
        print(f"Extracted {len(leads)} leads:")
        with open("e2e_results.json", "w", encoding="utf-8") as f:
            json.dump(leads, f, indent=2)
        print("Written to e2e_results.json")
    finally:
        try:
            scraper.driver.quit()
        except:
            pass
        print("Done!")
