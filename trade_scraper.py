"""
Trade Scraper — Layer 3 & 4: ImportYeti, Zauba, Alibaba
Free trade database scrapers for verified chitin importer data.
"""

import re, time, random, logging
import requests
from bs4 import BeautifulSoup
from datetime import datetime

logger = logging.getLogger('ChitinLeadModule')

USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0',
]


class TradeScraper:
    """Layer 3: Import/export trade databases (ImportYeti, Zauba)."""

    def __init__(self, timeout=15):
        self.timeout = timeout
        self.session = requests.Session()

    def _headers(self):
        return {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
        }

    def _fetch(self, url, retries=3):
        for attempt in range(retries):
            try:
                time.sleep(random.uniform(2, 5))
                resp = self.session.get(url, headers=self._headers(), timeout=self.timeout, allow_redirects=True)
                if resp.status_code == 200:
                    return resp.text
                logger.warning(f"HTTP {resp.status_code} for {url}")
            except Exception as e:
                logger.warning(f"TradeScraper fetch attempt {attempt+1}/{retries} for {url}: {e}")
                time.sleep(random.uniform(2, 4))
        return None

    def scrape_importyeti(self, keywords=None):
        """
        Layer 3a: Scrape ImportYeti.com for US import shipment data.
        Returns list of dicts with importer info.
        """
        if keywords is None:
            keywords = ['chitin', 'chitosan']

        results = []
        
        for keyword in keywords:
            url = f"https://www.importyeti.com/search#{keyword}"
            logger.info(f"[Layer 3] Scraping ImportYeti: {url}")

            try:
                html = self._fetch(f"https://www.importyeti.com/search?q={keyword}")
                if not html:
                    logger.warning(f"ImportYeti returned no data for '{keyword}'")
                    continue

                soup = BeautifulSoup(html, 'html.parser')

                # ImportYeti renders results in table/card format
                # Look for company entries
                company_cards = soup.select('.company-card, .search-result, tr[class*="result"], .result-row')
                
                if not company_cards:
                    # Try a more general approach — find tables with import data
                    tables = soup.find_all('table')
                    for table in tables:
                        rows = table.find_all('tr')
                        for row in rows[1:]:  # skip header
                            cells = row.find_all(['td', 'th'])
                            if len(cells) >= 3:
                                company_name = cells[0].get_text(strip=True)
                                if company_name and len(company_name) > 2:
                                    results.append({
                                        'company_name': company_name,
                                        'country': 'USA',
                                        'city': cells[1].get_text(strip=True) if len(cells) > 1 else 'N/A',
                                        'shipments': cells[2].get_text(strip=True) if len(cells) > 2 else 'N/A',
                                        'supplier_countries': cells[3].get_text(strip=True) if len(cells) > 3 else 'N/A',
                                        'last_shipment': cells[4].get_text(strip=True) if len(cells) > 4 else 'N/A',
                                        'source': 'ImportYeti',
                                        'search_keyword': keyword,
                                        'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                                    })
                
                for card in company_cards:
                    name_el = card.select_one('.company-name, .name, h3, h4, a')
                    name = name_el.get_text(strip=True) if name_el else ''
                    
                    if name and len(name) > 2:
                        # Extract location info
                        location_el = card.select_one('.location, .city, .address')
                        location = location_el.get_text(strip=True) if location_el else 'N/A'
                        
                        # Extract shipment count
                        shipment_el = card.select_one('.shipment-count, .count, .shipments')
                        shipments = shipment_el.get_text(strip=True) if shipment_el else 'N/A'

                        results.append({
                            'company_name': name,
                            'country': 'USA',
                            'city': location,
                            'shipments': shipments,
                            'supplier_countries': 'N/A',
                            'last_shipment': 'N/A',
                            'source': 'ImportYeti',
                            'search_keyword': keyword,
                            'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                        })

                logger.info(f"[Layer 3] ImportYeti found {len(results)} results for '{keyword}'")

            except Exception as e:
                logger.error(f"ImportYeti error for '{keyword}': {e}")

        return results

    def scrape_zauba(self):
        """
        Layer 3b: Scrape Zauba.com for India chitin import data.
        Returns list of dicts.
        """
        results = []
        url = "https://www.zauba.com/import-chitin-hs-code.html"
        logger.info(f"[Layer 3] Scraping Zauba: {url}")

        try:
            html = self._fetch(url)
            if not html:
                logger.warning("Zauba returned no data")
                return results

            soup = BeautifulSoup(html, 'html.parser')

            # Zauba shows tabular data
            tables = soup.find_all('table')
            for table in tables:
                rows = table.find_all('tr')
                for row in rows[1:]:
                    cells = row.find_all('td')
                    if len(cells) >= 4:
                        results.append({
                            'company_name': cells[0].get_text(strip=True) if cells[0] else 'N/A',
                            'country': 'India',
                            'city': cells[1].get_text(strip=True) if len(cells) > 1 else 'N/A',
                            'port': cells[2].get_text(strip=True) if len(cells) > 2 else 'N/A',
                            'quantity': cells[3].get_text(strip=True) if len(cells) > 3 else 'N/A',
                            'source': 'Zauba',
                            'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                        })

            logger.info(f"[Layer 3] Zauba found {len(results)} results")

        except Exception as e:
            logger.error(f"Zauba error: {e}")

        return results


class AlibabaScraper:
    """Layer 4: Alibaba buyer requests (free, Requests + BS4)."""

    def __init__(self, timeout=15):
        self.timeout = timeout
        self.session = requests.Session()

    def _headers(self):
        return {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Connection': 'keep-alive',
            'Referer': 'https://www.alibaba.com/',
        }

    def _fetch(self, url, retries=3):
        for attempt in range(retries):
            try:
                time.sleep(random.uniform(3, 6))
                resp = self.session.get(url, headers=self._headers(), timeout=self.timeout, allow_redirects=True)
                if resp.status_code == 200:
                    return resp.text
                logger.warning(f"Alibaba HTTP {resp.status_code} for {url}")
            except Exception as e:
                logger.warning(f"Alibaba fetch attempt {attempt+1}/{retries}: {e}")
                time.sleep(random.uniform(2, 5))
        return None

    def scrape_buyer_requests(self, keywords=None):
        """
        Layer 4: Scrape Alibaba for active chitin buying requests.
        Returns list of buyer lead dicts.
        """
        if keywords is None:
            keywords = ['chitin', 'chitosan']

        results = []

        for keyword in keywords:
            url = f"https://www.alibaba.com/trade/search?fsb=y&IndexArea=product_en&keywords={keyword}"
            logger.info(f"[Layer 4] Scraping Alibaba: {url}")

            try:
                html = self._fetch(url)
                if not html:
                    logger.warning(f"Alibaba returned no data for '{keyword}'")
                    continue

                soup = BeautifulSoup(html, 'html.parser')

                # Alibaba product/buyer listing items
                items = soup.select('.organic-list-offer, .list-no-v2-outter, .J-offer-wrapper, .organic-offer-wrapper')

                if not items:
                    # Fallback: try generic card detection
                    items = soup.select('[class*="offer"], [class*="product-card"], [class*="item"]')

                for item in items:
                    # Company name
                    company_el = item.select_one('.company-name, .seller-name, [class*="company"]')
                    company_name = company_el.get_text(strip=True) if company_el else ''

                    # Country
                    country_el = item.select_one('.country, .location, [class*="country"]')
                    country = country_el.get_text(strip=True) if country_el else 'N/A'

                    # Product / quantity
                    title_el = item.select_one('.title, h4, h3, [class*="title"]')
                    product = title_el.get_text(strip=True) if title_el else keyword

                    # Contact URL
                    link_el = item.select_one('a[href]')
                    contact_url = link_el['href'] if link_el else 'N/A'
                    if contact_url and not contact_url.startswith('http'):
                        contact_url = 'https:' + contact_url if contact_url.startswith('//') else 'https://www.alibaba.com' + contact_url

                    if company_name and len(company_name) > 2:
                        results.append({
                            'company_name': company_name,
                            'country': country,
                            'product': product,
                            'quantity_needed': 'N/A',
                            'contact_url': contact_url,
                            'source': 'Alibaba',
                            'search_keyword': keyword,
                            'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                        })

                logger.info(f"[Layer 4] Alibaba found {len(results)} results for '{keyword}'")

            except Exception as e:
                logger.error(f"Alibaba error for '{keyword}': {e}")

        return results


# Singletons
trade_scraper = TradeScraper()
alibaba_scraper = AlibabaScraper()
