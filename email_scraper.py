"""
Email Scraper — Layer 2: Website Contact Extraction
For every website URL found in Layer 1, visits homepage and contact pages
to extract email addresses, LinkedIn URLs, and contact person names.
"""

import re, time, random, logging
import requests
from bs4 import BeautifulSoup
from urllib.parse import urljoin, urlparse

logger = logging.getLogger('ChitinLeadModule')

# ── Rotating User-Agents ──
USER_AGENTS = [
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_5) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:126.0) Gecko/20100101 Firefox/126.0',
    'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 14.5; rv:126.0) Gecko/20100101 Firefox/126.0',
]

# ── Email regex ──
EMAIL_REGEX = re.compile(r'[\w.\-+]+@[\w.\-]+\.\w{2,}')

# ── Generic emails to skip ──
GENERIC_PREFIXES = {
    'info', 'admin', 'noreply', 'no-reply', 'support', 'webmaster',
    'postmaster', 'contact', 'hello', 'sales', 'marketing',
    'office', 'help', 'enquiry', 'inquiry', 'team'
}

# ── Contact page keywords ──
CONTACT_KEYWORDS = ['contact', 'about', 'team', 'reach', 'connect', 'staff', 'people', 'leadership']

# ── LinkedIn pattern ──
LINKEDIN_REGEX = re.compile(r'https?://(?:www\.)?linkedin\.com/(?:company|in)/[\w\-]+/?')


class EmailScraper:
    """Layer 2: Extract emails and LinkedIn profiles from company websites."""

    def __init__(self, timeout=10):
        self.timeout = timeout
        self.session = requests.Session()

    def _headers(self):
        return {
            'User-Agent': random.choice(USER_AGENTS),
            'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
            'Accept-Language': 'en-US,en;q=0.5',
            'Accept-Encoding': 'gzip, deflate',
            'Connection': 'keep-alive',
        }

    def _fetch(self, url, retries=3):
        """Fetch a URL with retries and random delay."""
        for attempt in range(retries):
            try:
                time.sleep(random.uniform(1, 3))
                resp = self.session.get(url, headers=self._headers(), timeout=self.timeout, allow_redirects=True)
                if resp.status_code == 200:
                    return resp.text
                logger.warning(f"HTTP {resp.status_code} for {url}")
            except Exception as e:
                logger.warning(f"Fetch attempt {attempt+1}/{retries} for {url}: {e}")
                time.sleep(random.uniform(1, 3))
        return None

    def _extract_emails(self, html):
        """Extract unique emails from HTML, filtering out generic ones."""
        emails = set(EMAIL_REGEX.findall(html.lower()))
        # Filter out generic, image files, etc.
        filtered = set()
        for email in emails:
            prefix = email.split('@')[0]
            domain = email.split('@')[1] if '@' in email else ''
            # Skip image extensions masquerading as emails
            if any(email.endswith(ext) for ext in ['.png', '.jpg', '.gif', '.svg', '.css', '.js']):
                continue
            # Skip generic
            if prefix in GENERIC_PREFIXES:
                # Still include — mark as generic but capture
                pass
            filtered.add(email)
        return list(filtered)

    def _extract_linkedin(self, html):
        """Extract LinkedIn company/profile URLs."""
        urls = LINKEDIN_REGEX.findall(html)
        return list(set(urls))

    def _find_contact_pages(self, base_url, html):
        """Find links that look like contact/about pages."""
        soup = BeautifulSoup(html, 'html.parser')
        contact_urls = set()
        
        for a in soup.find_all('a', href=True):
            href = a['href'].lower()
            text = (a.get_text() or '').lower()
            
            for keyword in CONTACT_KEYWORDS:
                if keyword in href or keyword in text:
                    full_url = urljoin(base_url, a['href'])
                    # Only follow same-domain links
                    if urlparse(full_url).netloc == urlparse(base_url).netloc:
                        contact_urls.add(full_url)
                    break

        return list(contact_urls)[:5]  # Max 5 sub-pages

    def _extract_contact_names(self, html):
        """Try to extract contact person names from common patterns."""
        soup = BeautifulSoup(html, 'html.parser')
        names = []
        
        # Look for common patterns like "CEO: John Doe", role headings, etc.
        name_patterns = [
            re.compile(r'(?:CEO|CTO|COO|CFO|Director|Manager|Owner|Founder|President|VP)[:\s\-]+([A-Z][a-z]+ [A-Z][a-z]+)', re.I),
            re.compile(r'([A-Z][a-z]+ [A-Z][a-z]+)\s*(?:,?\s*(?:CEO|CTO|COO|CFO|Director|Manager|Owner|Founder|President|VP))', re.I),
        ]
        
        text = soup.get_text()
        for pattern in name_patterns:
            matches = pattern.findall(text)
            names.extend(matches)
        
        # Also check structured data
        for el in soup.select('[class*="name"], [class*="team"], [class*="staff"]'):
            t = el.get_text(strip=True)
            if t and 2 <= len(t.split()) <= 4 and t[0].isupper():
                names.append(t)

        return list(set(names))[:3]  # Top 3

    def scrape_website(self, website_url):
        """
        Full Layer 2 scrape for a single website.
        Returns dict with extracted data.
        """
        result = {
            'emails': [],
            'linkedin_urls': [],
            'contact_persons': [],
            'pages_scraped': 0,
        }

        if not website_url or website_url == 'N/A' or len(website_url.strip()) < 6:
            return result

        # Ensure URL has scheme
        if not website_url.startswith('http'):
            website_url = 'https://' + website_url

        logger.info(f"[Layer 2] Scraping website: {website_url}")

        # 1. Scrape homepage
        homepage_html = self._fetch(website_url)
        if not homepage_html:
            return result

        result['pages_scraped'] += 1
        result['emails'].extend(self._extract_emails(homepage_html))
        result['linkedin_urls'].extend(self._extract_linkedin(homepage_html))
        result['contact_persons'].extend(self._extract_contact_names(homepage_html))

        # 2. Find and scrape contact/about pages
        contact_pages = self._find_contact_pages(website_url, homepage_html)
        for page_url in contact_pages:
            page_html = self._fetch(page_url)
            if page_html:
                result['pages_scraped'] += 1
                result['emails'].extend(self._extract_emails(page_html))
                result['linkedin_urls'].extend(self._extract_linkedin(page_html))
                result['contact_persons'].extend(self._extract_contact_names(page_html))

        # Deduplicate
        result['emails'] = list(set(result['emails']))
        result['linkedin_urls'] = list(set(result['linkedin_urls']))
        result['contact_persons'] = list(set(result['contact_persons']))

        logger.info(f"[Layer 2] Found {len(result['emails'])} emails, {len(result['linkedin_urls'])} LinkedIn URLs from {website_url}")
        return result


# Singleton for reuse
email_scraper = EmailScraper()
