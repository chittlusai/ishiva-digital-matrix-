"""
ChitinLeadModule — Layer 1: Google Maps Selenium Scraper
Searches Google Maps for chitin/chitosan importers across target countries.
Yields results as a generator for SSE streaming.
"""

import os, time, random, logging, json, re
from datetime import datetime
from selenium import webdriver
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC

# ── Logging ──
LOG_PATH = os.path.join(os.path.dirname(__file__), 'chitin_errors.log')
logging.basicConfig(
    filename=LOG_PATH,
    level=logging.INFO,
    format='%(asctime)s [%(levelname)s] %(message)s'
)
logger = logging.getLogger('ChitinLeadModule')

# ── Rotating User-Agents ──
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/123.0.0.0 Safari/537.36 Edg/123.0.0.0',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.5 Safari/605.1.15',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
    'Mozilla/5.0 (X11; Ubuntu; Linux x86_64; rv:125.0) Gecko/20100101 Firefox/125.0',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
]

# ── Target Countries ──
TARGET_COUNTRIES = [
    'USA', 'Japan', 'Germany', 'South Korea', 'France',
    'Australia', 'China', 'Netherlands', 'Canada', 'UK'
]

# ── Search Queries (parameterized with country) ──
SEARCH_TEMPLATES = [
    "chitin importer {country}",
    "chitosan buyer {country}",
    "marine chemical importer {country}",
]

HS_CODE = "3913 10 00"


class ChitinLeadModule:
    """Layer 1: Google Maps lead scraper for chitin importers."""

    def __init__(self, proxy=None):
        self.driver = None
        self.proxy = proxy
        self.seen = set()  # dedup by (company_name_lower, country)

    def setup_driver(self):
        """Initialize headless Chrome with a random User-Agent."""
        options = Options()
        ua = random.choice(USER_AGENTS)
        options.add_argument(f'--user-agent={ua}')
        options.add_argument('--headless=new')
        options.add_argument('--no-sandbox')
        options.add_argument('--disable-dev-shm-usage')
        options.add_argument('--disable-gpu')
        options.add_argument('--window-size=1920,1080')
        options.add_argument('--disable-blink-features=AutomationControlled')
        options.add_experimental_option('excludeSwitches', ['enable-automation'])

        if self.proxy:
            options.add_argument(f'--proxy-server={self.proxy}')

        try:
            self.driver = webdriver.Chrome(options=options)
            self.driver.execute_script(
                "Object.defineProperty(navigator, 'webdriver', {get: () => undefined})"
            )
            logger.info(f"Chrome driver initialized with UA: {ua[:60]}...")
        except Exception as e:
            logger.error(f"Failed to init Chrome driver: {e}")
            raise

    def _random_delay(self, lo=2, hi=5):
        time.sleep(random.uniform(lo, hi))

    def _retry(self, func, retries=3, label=""):
        """Retry wrapper with exponential backoff."""
        for attempt in range(retries):
            try:
                return func()
            except Exception as e:
                wait = (attempt + 1) * 2 + random.random()
                logger.warning(f"[{label}] Attempt {attempt+1}/{retries} failed: {e}. Retrying in {wait:.1f}s")
                time.sleep(wait)
        logger.error(f"[{label}] All {retries} retries exhausted.")
        return None

    def scrape_google_maps(self, countries, limit=50):
        """
        Generator that yields lead dicts from Google Maps.
        Searches each country × query template until `limit` is reached.
        """
        count = 0

        for country in countries:
            if count >= limit:
                return

            for template in SEARCH_TEMPLATES:
                if count >= limit:
                    return

                query = template.format(country=country)
                logger.info(f"Searching Google Maps: '{query}'")

                try:
                    url = f"https://www.google.com/maps/search/{query.replace(' ', '+')}"
                    self.driver.get(url)
                    self._random_delay(3, 6)

                    # Wait for results panel
                    try:
                        WebDriverWait(self.driver, 10).until(
                            EC.presence_of_element_located((By.CSS_SELECTOR, 'div[role="feed"]'))
                        )
                    except:
                        logger.warning(f"No feed found for query: {query}")
                        continue

                    # Scroll the results panel to load more
                    feed = self.driver.find_element(By.CSS_SELECTOR, 'div[role="feed"]')
                    for _ in range(5):
                        self.driver.execute_script(
                            "arguments[0].scrollTop = arguments[0].scrollHeight", feed
                        )
                        self._random_delay(1.5, 3)

                    # Get all listing links
                    listings = self.driver.find_elements(By.CSS_SELECTOR, 'a[href*="/maps/place/"]')
                    unique_hrefs = list(dict.fromkeys([a.get_attribute('href') for a in listings if a.get_attribute('href')]))

                    logger.info(f"Found {len(unique_hrefs)} listings for '{query}'")

                    for href in unique_hrefs:
                        if count >= limit:
                            return

                        lead = self._extract_listing(href, country, query)
                        if lead:
                            key = (lead['company_name'].lower().strip(), lead['country'].lower().strip())
                            if key not in self.seen:
                                self.seen.add(key)
                                count += 1
                                yield lead

                except Exception as e:
                    logger.error(f"Error searching '{query}': {e}")
                    continue

    def _extract_listing(self, maps_url, country, search_query):
        """Navigate to a single Maps listing and extract details."""
        def _do_extract():
            self.driver.get(maps_url)
            self._random_delay(2, 4)

            name = ''
            phone = 'N/A'
            address = 'N/A'
            website = 'N/A'

            # Business Name
            try:
                name_el = WebDriverWait(self.driver, 8).until(
                    EC.presence_of_element_located((By.CSS_SELECTOR, 'h1.DUwDvf, h1.fontHeadlineLarge'))
                )
                name = name_el.text.strip()
            except:
                # Try fallback
                try:
                    name = self.driver.find_element(By.CSS_SELECTOR, 'h1').text.strip()
                except:
                    return None

            if not name:
                return None

            # Phone
            try:
                phone_btns = self.driver.find_elements(
                    By.CSS_SELECTOR, 'button[data-tooltip="Copy phone number"], a[href^="tel:"]'
                )
                for btn in phone_btns:
                    txt = btn.get_attribute('aria-label') or btn.text
                    if txt:
                        phone_match = re.search(r'[\+\d\s\-\(\)]{7,}', txt)
                        if phone_match:
                            phone = phone_match.group().strip()
                            break
            except:
                pass

            # Address
            try:
                addr_btns = self.driver.find_elements(
                    By.CSS_SELECTOR, 'button[data-item-id="address"], button[data-tooltip="Copy address"]'
                )
                for btn in addr_btns:
                    txt = btn.get_attribute('aria-label') or btn.text
                    if txt and len(txt) > 5:
                        address = txt.replace('Address: ', '').strip()
                        break
            except:
                pass

            # Website
            try:
                web_links = self.driver.find_elements(
                    By.CSS_SELECTOR, 'a[data-item-id="authority"], a[href][data-tooltip="Open website"]'
                )
                for link in web_links:
                    href = link.get_attribute('href')
                    if href and 'google' not in href and href.startswith('http'):
                        website = href
                        break
            except:
                pass

            return {
                'company_name': name,
                'country': country,
                'city': address.split(',')[0].strip() if address != 'N/A' else 'N/A',
                'address': address,
                'contact_person': 'N/A',
                'email': 'N/A',
                'phone': phone,
                'website': website,
                'linkedin': 'N/A',
                'hs_code': HS_CODE,
                'source': 'Google Maps',
                'maps_url': maps_url,
                'search_query': search_query,
                'confidence': 'LOW',
                'date_scraped': datetime.now().strftime('%Y-%m-%d'),
            }

        return self._retry(_do_extract, retries=2, label=f"Extract: {maps_url[:60]}")

    def close(self):
        if self.driver:
            try:
                self.driver.quit()
            except:
                pass
            self.driver = None
