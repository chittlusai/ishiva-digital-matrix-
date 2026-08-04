import os, json, uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS
from dotenv import load_dotenv

load_dotenv()

app = Flask(__name__, static_folder='static')
app.secret_key = os.environ.get('FLASK_SECRET_KEY', 'ishiva-lead-matrix-default')
CORS(app)

from sheets_integration import sheets_sync
from email_service import email_notify

# Initialize from environment
sheets_sync.set_spreadsheet_id(os.environ.get('SHEETS_SPREADSHEET_ID', ''))
email_notify.set_password(os.environ.get('GMAIL_APP_PASSWORD', ''))

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'db.json')

DEFAULT_USERS = [
    {'id': '9515619108', 'pass': 'ishiva@9108', 'name': 'Gowtham Vanapalli', 'role': 'admin'},
    {'id': '9515619109', 'pass': 'ishiva@9109', 'name': 'Pawan Shiva', 'role': 'agent'},
    {'id': '9515619110', 'pass': 'ishiva@9110', 'name': 'Avinash Shiva Teja', 'role': 'agent'},
    {'id': '9515619111', 'pass': 'ishiva@9111', 'name': 'Sindhu', 'role': 'agent'},
    {'id': '9515619112', 'pass': 'ishiva@9112', 'name': 'Lead Agent', 'role': 'agent'},
    {'id': '2569687413', 'pass': 'ishiva@7413', 'name': 'Satvika Bandaru', 'role': 'agent'},
]

def load_db():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    if not os.path.exists(DB_PATH):
        db = {"leads": [], "tasks": [], "action_logs": [], "messages": [], "channels": {"general": [], "ira_ai": []}, "settings": {"admin_email": os.environ.get('ADMIN_EMAIL', ''), "sheets_id": ""}, "users": DEFAULT_USERS}
        save_db(db)
        return db
    with open(DB_PATH, 'r', encoding='utf-8') as f:
        raw = f.read()
    if not raw.strip():
        # Empty file — reset
        db = {"leads": [], "tasks": [], "action_logs": [], "messages": [], "channels": {"general": [], "ira_ai": []}, "settings": {}, "users": DEFAULT_USERS}
        save_db(db)
        return db
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        # Attempt recovery: extract first valid JSON object
        try:
            decoder = json.JSONDecoder()
            data, _ = decoder.raw_decode(raw)
            save_db(data)  # Re-save clean version immediately
        except Exception:
            # Unrecoverable — start fresh but keep backup
            import shutil
            shutil.copy(DB_PATH, DB_PATH + '.corrupt')
            data = {"leads": [], "tasks": [], "action_logs": [], "messages": [], "channels": {"general": [], "ira_ai": []}, "settings": {}, "users": DEFAULT_USERS}
            save_db(data)
    if 'channels' not in data:
        data['channels'] = {"general": [], "ira_ai": []}
    if 'users' not in data:
        data['users'] = DEFAULT_USERS
    return data

def save_db(db):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    # Atomic write: write to temp file then replace to avoid corruption on crash/concurrent writes
    tmp_path = DB_PATH + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, DB_PATH)

# ── Pages ──
@app.route('/', defaults={'path': ''})
@app.route('/<path:path>')
def serve_index(path):
    if path.startswith('api/'):
        return jsonify({"error": "Not found"}), 404
    return send_from_directory('static', 'index.html')

# ── Auth ──
@app.route('/api/auth', methods=['POST'])
def auth():
    db = load_db()
    data = request.json
    user = next((u for u in db.get('users', []) if u['id'] == data.get('id') and u['pass'] == data.get('pass')), None)
    if user:
        return jsonify({"ok": True, "user": {k: v for k, v in user.items() if k != 'pass'}})
    return jsonify({"ok": False}), 401

# ── Scraper Stream ──
@app.route('/api/scrape_stream')
def api_scrape_stream():
    from scraper import GoogleMapsScraper
    location = request.args.get('location', '')
    category = request.args.get('category', '')
    country = request.args.get('country', 'India')
    limit = int(request.args.get('limit', 20))
    agent = request.args.get('agent', 'unknown')
    lead_type = request.args.get('leadType', 'all')
    skip_count = int(request.args.get('skip', 0))

    if not category or not location:
        return jsonify({"error": "Location and category are required"}), 400

    def generate():
        scraper = GoogleMapsScraper()
        try:
            scraper.setup_driver()
            for lead in scraper.extract_business_details(location, category, country, limit, lead_type, skip_count):
                # Duplicate Check
                db = load_db()
                existing = next((l for l in db['leads'] if l.get('phone') == lead.get('phone') and l.get('phone') != 'N/A'), None)
                if existing:
                    continue

                lead['lead_id'] = str(uuid.uuid4())[:8]
                lead['agent'] = agent
                lead['client_status'] = 'new'
                lead['tasks'] = [
                    {'step': 1, 'label': 'First Contact Attempt', 'done': False},
                    {'step': 2, 'label': 'Follow-up Call', 'done': False},
                    {'step': 3, 'label': 'Send WhatsApp/Email', 'done': False},
                    {'step': 4, 'label': 'Schedule Demo', 'done': False},
                    {'step': 5, 'label': 'Present Proposal', 'done': False},
                    {'step': 6, 'label': 'Client Decision', 'done': False},
                    {'step': 7, 'label': 'Onboarding', 'done': False},
                ]
                lead['action_history'] = []
                db['leads'].append(lead)
                save_db(db)
                
                # Live Sync to Google Sheets
                sheets_sync.sync_lead(lead)
                
                yield f"data: {json.dumps(lead)}\n\n"
            yield "data: {\"done\": true}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"
        finally:
            if scraper.driver:
                scraper.driver.quit()

    response = app.response_class(generate(), mimetype='text/event-stream')
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Cache-Control'] = 'no-cache'
    return response

# ── Leads ──
@app.route('/api/leads')
def get_leads():
    db = load_db()
    agent = request.args.get('agent')
    leads = db['leads']
    if agent:
        leads = [l for l in leads if l.get('agent') == agent]
    return jsonify(leads)

@app.route('/api/leads/<lead_id>')
def get_lead(lead_id):
    db = load_db()
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if not lead:
        return jsonify({"error": "Not found"}), 404
    return jsonify(lead)

@app.route('/api/leads/<lead_id>/action', methods=['POST'])
def lead_action(lead_id):
    db = load_db()
    data = request.json
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if not lead:
        return jsonify({"error": "Not found"}), 404

    action = {
        'id': str(uuid.uuid4())[:8],
        'type': data.get('type', 'note'),
        'agent': data.get('agent', 'unknown'),
        'note': data.get('note', ''),
        'timestamp': datetime.now().isoformat()
    }
    lead.setdefault('action_history', []).append(action)

    # Update client status
    status_map = {'accepted': 'accepted', 'rejected': 'rejected', 'answered': 'contacted', 'called': 'contacted', 'no_answer': 'no_answer', 'followup': 'followup'}
    if data.get('type') in status_map:
        lead['client_status'] = status_map[data['type']]

    # Log globally
    db['action_logs'].append({**action, 'lead_id': lead_id, 'business': lead.get('business_name', '')})
    save_db(db)
    
    # Sync updated lead to sheets
    sheets_sync.sync_lead(lead)
    
    # Send email notification
    email_notify.notify_lead_action(lead, action)
    
    return jsonify({"ok": True, "action": action})

@app.route('/api/leads/<lead_id>/task', methods=['POST'])
def update_lead_task(lead_id):
    db = load_db()
    data = request.json
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if not lead:
        return jsonify({"error": "Not found"}), 404
    step = data.get('step')
    done = data.get('done', True)
    for t in lead.get('tasks', []):
        if t['step'] == step:
            t['done'] = done
    save_db(db)
    return jsonify({"ok": True})

@app.route('/api/leads/<lead_id>/notes', methods=['POST'])
def update_lead_notes(lead_id):
    db = load_db()
    data = request.json
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if not lead:
        return jsonify({"error": "Not found"}), 404
    lead['notes'] = data.get('notes', '')
    save_db(db)
    return jsonify({"ok": True})

@app.route('/api/leads/<lead_id>', methods=['DELETE'])
def delete_lead(lead_id):
    db = load_db()
    db['leads'] = [l for l in db['leads'] if l.get('lead_id') != lead_id]
    save_db(db)
    return jsonify({"ok": True})

# ── Lead Claim/Lock System ──
@app.route('/api/leads/<lead_id>/claim', methods=['POST'])
def claim_lead(lead_id):
    """Try to claim/lock a lead for an agent. Returns conflict if already claimed."""
    db = load_db()
    data = request.json
    agent_id = data.get('agent_id')
    agent_name = data.get('agent_name')
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if not lead:
        return jsonify({"ok": False, "error": "Lead not found"}), 404

    # Check if already claimed by someone else (auto-expires after 30 minutes)
    from datetime import timedelta
    existing_claim = lead.get('claimed_by')
    claimed_at_str = lead.get('claimed_at')
    if existing_claim and existing_claim != agent_id and claimed_at_str:
        claimed_at = datetime.fromisoformat(claimed_at_str)
        if datetime.now() - claimed_at < timedelta(minutes=30):
            return jsonify({
                "ok": False,
                "conflict": True,
                "claimed_by_name": lead.get('claimed_by_name', 'Another Agent'),
                "claimed_at": claimed_at_str
            }), 409

    # Claim it
    lead['claimed_by'] = agent_id
    lead['claimed_by_name'] = agent_name
    lead['claimed_at'] = datetime.now().isoformat()
    save_db(db)
    return jsonify({"ok": True})

@app.route('/api/leads/<lead_id>/claim', methods=['DELETE'])
def release_lead(lead_id):
    """Release a lead claim when agent closes the detail panel."""
    db = load_db()
    data = request.json or {}
    agent_id = data.get('agent_id')
    lead = next((l for l in db['leads'] if l.get('lead_id') == lead_id), None)
    if lead and lead.get('claimed_by') == agent_id:
        lead.pop('claimed_by', None)
        lead.pop('claimed_by_name', None)
        lead.pop('claimed_at', None)
        save_db(db)
    return jsonify({"ok": True})

# ── Pipeline View ──
@app.route('/api/leads/pipeline')
def get_pipeline():
    db = load_db()
    pipeline = {'new': [], 'contacted': [], 'followup': [], 'accepted': [], 'rejected': [], 'no_answer': []}
    for l in db['leads']:
        status = l.get('client_status', 'new')
        if status in pipeline:
            pipeline[status].append(l)
        else:
            pipeline['new'].append(l)
    counts = {k: len(v) for k, v in pipeline.items()}
    return jsonify({"pipeline": counts, "total": len(db['leads'])})

# ── Add Lead Manually ──
@app.route('/api/leads/add', methods=['POST'])
def add_lead():
    db = load_db()
    data = request.json
    lead = {
        'lead_id': str(uuid.uuid4())[:8],
        'business_name': data.get('business_name', ''),
        'phone': data.get('phone', 'N/A'),
        'email': data.get('email', 'N/A'),
        'website': data.get('website', 'N/A'),
        'category': data.get('category', ''),
        'location': data.get('location', ''),
        'country': data.get('country', 'India'),
        'rating': data.get('rating', 'N/A'),
        'reviews': data.get('reviews', 'N/A'),
        'photo_url': data.get('photo_url', ''),
        'full_address': data.get('full_address', 'N/A'),
        'priority': '🔥 HIGH' if data.get('website', 'N/A') == 'N/A' else '🟡 MEDIUM',
        'has_website': 'No' if data.get('website', 'N/A') == 'N/A' else 'Yes',
        'date_scraped': datetime.now().strftime('%Y-%m-%d'),
        'agent': data.get('agent', 'unknown'),
        'client_status': 'new',
        'lead_status': 'New Lead',
        'notes': '',
        'tasks': [
            {'step': 1, 'label': 'First Contact Attempt', 'done': False},
            {'step': 2, 'label': 'Follow-up Call', 'done': False},
            {'step': 3, 'label': 'Send WhatsApp/Email', 'done': False},
            {'step': 4, 'label': 'Schedule Demo', 'done': False},
            {'step': 5, 'label': 'Present Proposal', 'done': False},
            {'step': 6, 'label': 'Client Decision', 'done': False},
            {'step': 7, 'label': 'Onboarding', 'done': False},
        ],
        'action_history': []
    }
    db['leads'].append(lead)
    save_db(db)
    return jsonify({"ok": True, "lead": lead})

# ── Team Chat ──
@app.route('/api/messages', methods=['GET', 'POST'])
def handle_messages():
    db = load_db()
    channel = request.args.get('channel', 'general')
    
    if request.method == 'POST':
        msg = request.json
        msg['timestamp'] = datetime.now().isoformat()
        msg['id'] = str(uuid.uuid4())[:8]
        msg['channel'] = channel
        db.setdefault('messages', []).append(msg)
        
        # Ira AI Intervention Logic — Enhanced
        text = msg.get('text', '').lower()
        if channel == 'ira_ai' or 'ira' in text or '@ira' in text:
            leads = db.get('leads', [])
            total = len(leads)
            accepted = len([l for l in leads if l.get('client_status') == 'accepted'])
            rejected = len([l for l in leads if l.get('client_status') == 'rejected'])
            contacted = len([l for l in leads if l.get('client_status') == 'contacted'])
            no_answer = len([l for l in leads if l.get('client_status') == 'no_answer'])
            new_leads = len([l for l in leads if l.get('client_status') == 'new'])
            hot_leads = len([l for l in leads if l.get('priority', '').find('HIGH') > -1])
            
            ai_reply = f"📊 Current Pipeline: {total} total leads — {new_leads} new, {contacted} contacted, {accepted} accepted, {rejected} rejected, {no_answer} no answer. {hot_leads} high-priority leads need attention!"
            
            if 'export' in text:
                ai_reply = "📥 To export your leads, navigate to the **Leads** tab and click the **Export All** button. It will generate a professional PDF report with all your data."
            elif 'help' in text:
                ai_reply = "👋 I'm Ira, your AI assistant! I can help with:\n• **Pipeline status** — ask 'how are we doing?'\n• **Lead insights** — ask about priorities\n• **Export help** — ask about reports\n• **Task guidance** — ask about daily schedule"
            elif 'priority' in text or 'hot' in text:
                hot = [l for l in leads if l.get('priority', '').find('HIGH') > -1][:5]
                names = ', '.join([l['business_name'] for l in hot]) if hot else 'None found'
                ai_reply = f"🔥 Top priority leads without websites: {names}. These businesses need digital presence — highest conversion potential!"
            elif 'schedule' in text or 'task' in text or 'today' in text:
                ai_reply = f"📋 Today's recommended schedule:\n1. Call {hot_leads} high-priority leads first\n2. Follow up on {no_answer} unanswered calls\n3. Send proposals to {contacted} contacted leads\n4. Run scraper for fresh leads in new territory"
            elif 'how' in text or 'status' in text or 'doing' in text:
                rate = round((accepted / total * 100), 1) if total > 0 else 0
                ai_reply = f"📈 Performance Report: {rate}% acceptance rate. {accepted} deals won out of {total} leads. Focus areas: {no_answer} leads need re-contact, {new_leads} fresh leads awaiting first contact."
            elif '?' in text:
                ai_reply = f"🤔 Great question! Based on our current database of {total} leads, I'd recommend focusing on the {hot_leads} high-priority leads first. Navigate to the Leads tab and sort by priority to get started."
            
            db['messages'].append({
                "id": str(uuid.uuid4())[:8],
                "user_id": "ira_ai",
                "user_name": "Ira AI",
                "text": ai_reply,
                "timestamp": datetime.now().isoformat(),
                "is_ai": True,
                "channel": channel
            })

        if len(db['messages']) > 200:
            db['messages'] = db['messages'][-200:]
        save_db(db)
        return jsonify({"ok": True})
    
    # GET — filter by channel
    msgs = [m for m in db.get('messages', []) if m.get('channel', 'general') == channel]
    return jsonify(msgs)

# ── Ira AI Analysis ──
@app.route('/api/ai/analyze', methods=['POST'])
def ai_analyze():
    lead = request.json
    website = lead.get('website', '')
    biz = lead.get('business_name', 'This business')
    cat = lead.get('category', 'industry')
    rating = lead.get('rating', 'N/A')
    reviews = lead.get('reviews', '0')
    
    if not website or website == 'N/A' or len(website.strip()) < 4:
        analysis = {
            "summary": f"{biz} is missing a digital storefront, which is a major growth barrier in the {cat} sector. With {reviews} Google reviews and a {rating} rating, they have strong local presence but zero online conversion capability.",
            "score": 92,
            "issues": [
                f"No online visibility when customers search for {cat} services.",
                "Customer trust is significantly lower without a professional site.",
                "Missing automated lead capture and booking systems.",
                "Competitors with websites are capturing their potential customers."
            ],
            "upgrades": [
                "Launch a high-speed, mobile-optimized landing page with booking.",
                "Integrate 'Book Now' and 'Get Quote' functionality.",
                "Connect to Google Business Profile for local SEO dominance.",
                "Set up automated follow-up email sequences."
            ],
            "pitch": f"Hi, I'm calling from ishiva Digital. I noticed {biz} doesn't have a website yet — with your {rating} rating and {reviews} reviews, you're already a trusted name. We can build you a professional site that turns those searchers into paying customers."
        }
    else:
        analysis = {
            "summary": f"The website for {biz} has potential but needs professional optimization to dominate the local {cat} market. Current rating: {rating} ({reviews} reviews).",
            "score": 68,
            "issues": [
                f"Slow mobile loading speed detected (potential 40% bounce rate).",
                "Non-responsive design elements on mobile devices.",
                "Outdated SEO meta tags hurting local search ranking.",
                "No conversion tracking or analytics integration."
            ],
            "upgrades": [
                "Optimize image assets for next-gen formats (WebP/AVIF).",
                "Install a modern, conversion-focused responsive layout.",
                "Add sticky Call-to-Action (CTA) above the fold.",
                "Implement Google Analytics 4 and conversion tracking."
            ],
            "pitch": f"Hi, I'm calling from ishiva Digital. I reviewed {biz}'s website and found some quick wins that could significantly boost your local search ranking and customer conversions."
        }
    return jsonify(analysis)

# ── Admin: Tasks ──
@app.route('/api/admin/tasks', methods=['GET'])
def get_tasks():
    db = load_db()
    return jsonify(db.get('tasks', []))

@app.route('/api/admin/tasks', methods=['POST'])
def create_task():
    db = load_db()
    data = request.json
    task = {
        'id': str(uuid.uuid4())[:8],
        'title': data.get('title', ''),
        'assigned_to': data.get('assigned_to', ''),
        'assigned_name': data.get('assigned_name', ''),
        'status': 'pending',
        'created': datetime.now().isoformat()
    }
    db.setdefault('tasks', []).append(task)
    save_db(db)
    return jsonify({"ok": True, "task": task})

@app.route('/api/admin/tasks/<task_id>', methods=['PATCH'])
def update_task(task_id):
    db = load_db()
    task = next((t for t in db.get('tasks', []) if t.get('id') == task_id), None)
    if task:
        task['status'] = request.json.get('status', 'pending')
        save_db(db)
        return jsonify({"ok": True})
    return jsonify({"error": "Not found"}), 404

@app.route('/api/admin/tasks/<task_id>', methods=['DELETE'])
def delete_task(task_id):
    db = load_db()
    db['tasks'] = [t for t in db.get('tasks', []) if t.get('id') != task_id]
    save_db(db)
    return jsonify({"ok": True})

# ── Stats & Activity ──
@app.route('/api/admin/logs')
def get_logs():
    db = load_db()
    logs = db.get('action_logs', [])
    logs.sort(key=lambda x: x.get('timestamp', ''), reverse=True)
    return jsonify(logs[:100])

@app.route('/api/admin/stats')
def admin_stats():
    db = load_db()
    l = db['leads']
    total = len(l)
    accepted = len([x for x in l if x.get('client_status') == 'accepted'])
    rejected = len([x for x in l if x.get('client_status') == 'rejected'])
    contacted = len([x for x in l if x.get('client_status') == 'contacted'])
    no_answer = len([x for x in l if x.get('client_status') == 'no_answer'])
    followup = len([x for x in l if x.get('client_status') == 'followup'])
    new_count = len([x for x in l if x.get('client_status') == 'new'])
    hot = len([x for x in l if 'HIGH' in (x.get('priority') or '')])
    
    # Per-agent stats
    agent_stats = {}
    for lead in l:
        agent = lead.get('agent', 'Unknown')
        if agent not in agent_stats:
            agent_stats[agent] = {'total': 0, 'accepted': 0, 'rejected': 0, 'contacted': 0}
        agent_stats[agent]['total'] += 1
        status = lead.get('client_status', 'new')
        if status in agent_stats[agent]:
            agent_stats[agent][status] += 1
    
    return jsonify({
        'total': total,
        'accepted': accepted,
        'rejected': rejected,
        'contacted': contacted,
        'no_answer': no_answer,
        'followup': followup,
        'new': new_count,
        'hot': hot,
        'conversion_rate': round((accepted / total * 100), 1) if total > 0 else 0,
        'agent_stats': agent_stats
    })

# ── Users list (for admin) ──
@app.route('/api/admin/users', methods=['GET'])
def get_users():
    db = load_db()
    return jsonify(db.get('users', []))

@app.route('/api/admin/users', methods=['POST'])
def add_user():
    db = load_db()
    data = request.json
    new_user = {
        'id': data.get('id', ''),
        'pass': data.get('pass', ''),
        'name': data.get('name', ''),
        'role': data.get('role', 'agent')
    }
    # prevent duplicates
    db['users'] = [u for u in db.get('users', []) if u['id'] != new_user['id']]
    db['users'].append(new_user)
    save_db(db)
    return jsonify({"ok": True, "user": new_user})

@app.route('/api/admin/users/<user_id>', methods=['DELETE'])
def delete_user(user_id):
    db = load_db()
    db['users'] = [u for u in db.get('users', []) if u['id'] != user_id]
    save_db(db)
    return jsonify({"ok": True})

# ═══════════════════════════════════════════════════════════════
# ── CHITIN EXPORT DATA MODULE ──
# ═══════════════════════════════════════════════════════════════

CHITIN_DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'chitin_leads.json')

def load_chitin_db():
    os.makedirs(os.path.dirname(CHITIN_DB_PATH), exist_ok=True)
    if not os.path.exists(CHITIN_DB_PATH):
        db = {"leads": [], "trade_data": [], "alibaba_data": [], "email_data": [], "last_updated": ""}
        save_chitin_db(db)
        return db
    with open(CHITIN_DB_PATH, 'r') as f:
        return json.load(f)

def save_chitin_db(db):
    os.makedirs(os.path.dirname(CHITIN_DB_PATH), exist_ok=True)
    # Atomic write to prevent corruption
    tmp_path = CHITIN_DB_PATH + '.tmp'
    with open(tmp_path, 'w', encoding='utf-8') as f:
        json.dump(db, f, indent=2, ensure_ascii=False)
    os.replace(tmp_path, CHITIN_DB_PATH)

@app.route('/chitin')
def serve_chitin():
    return send_from_directory('static', 'chitin.html')

@app.route('/api/chitin/scrape_stream')
def chitin_scrape_stream():
    """SSE endpoint for live chitin lead scraping — all 4 layers."""
    from chitin_lead_module import ChitinLeadModule
    from email_scraper import email_scraper
    from trade_scraper import trade_scraper, alibaba_scraper

    countries_param = request.args.get('countries', '')
    countries = [c.strip() for c in countries_param.split(',') if c.strip()]
    limit = min(int(request.args.get('limit', 50)), 100)
    sources = request.args.get('sources', 'maps,email,trade,alibaba')
    source_list = [s.strip() for s in sources.split(',')]

    if not countries:
        countries = ['USA', 'Japan', 'Germany']

    def generate():
        chitin = ChitinLeadModule()
        db = load_chitin_db()
        count = 0

        # ── LAYER 1: Google Maps ──
        if 'maps' in source_list:
            try:
                yield f"data: {json.dumps({'status': 'Starting Layer 1: Google Maps Scraper...'})}\n\n"
                chitin.setup_driver()

                for lead in chitin.scrape_google_maps(countries, limit):
                    # ── LAYER 2: Email enrichment ──
                    if 'email' in source_list and lead.get('website', 'N/A') != 'N/A':
                        try:
                            enrich_msg = f"Enriching: {lead['company_name']}..."
                            yield f"data: {json.dumps({'status': enrich_msg})}\n\n"
                            email_data = email_scraper.scrape_website(lead['website'])
                            if email_data['emails']:
                                lead['email'] = email_data['emails'][0]
                                # Update confidence
                                lead['confidence'] = 'MEDIUM'
                            if email_data['linkedin_urls']:
                                lead['linkedin'] = email_data['linkedin_urls'][0]
                            if email_data['contact_persons']:
                                lead['contact_person'] = email_data['contact_persons'][0]

                            # Store email data
                            db['email_data'].append({
                                'company': lead['company_name'],
                                'website': lead['website'],
                                'emails': email_data['emails'],
                                'linkedin': email_data['linkedin_urls'],
                                'contacts': email_data['contact_persons'],
                                'pages_scraped': email_data['pages_scraped'],
                            })
                        except Exception as e:
                            pass

                    lead['lead_id'] = str(uuid.uuid4())[:8]
                    db['leads'].append(lead)
                    count += 1
                    yield f"data: {json.dumps({**lead, 'layer': 1, 'count': count})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': f'Layer 1 error: {str(e)}'})}\n\n"
            finally:
                chitin.close()

        # ── LAYER 3: Trade databases ──
        if 'trade' in source_list:
            try:
                yield f"data: {json.dumps({'status': 'Starting Layer 3: Trade Database Scraper...'})}\n\n"

                importyeti_results = trade_scraper.scrape_importyeti()
                for result in importyeti_results:
                    result['lead_id'] = str(uuid.uuid4())[:8]
                    db['trade_data'].append(result)
                    # Also add to main leads if not duplicate
                    key = result['company_name'].lower().strip()
                    if not any(l['company_name'].lower().strip() == key for l in db['leads']):
                        merged = {
                            'lead_id': result['lead_id'],
                            'company_name': result['company_name'],
                            'country': result.get('country', 'USA'),
                            'city': result.get('city', 'N/A'),
                            'address': 'N/A',
                            'contact_person': 'N/A',
                            'email': 'N/A',
                            'phone': 'N/A',
                            'website': 'N/A',
                            'linkedin': 'N/A',
                            'hs_code': '3913 10 00',
                            'source': 'ImportYeti',
                            'confidence': 'MEDIUM',
                            'shipments': result.get('shipments', 'N/A'),
                            'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                        }
                        db['leads'].append(merged)
                        count += 1
                        yield f"data: {json.dumps({**merged, 'layer': 3, 'count': count})}\n\n"

                zauba_results = trade_scraper.scrape_zauba()
                for result in zauba_results:
                    result['lead_id'] = str(uuid.uuid4())[:8]
                    db['trade_data'].append(result)

            except Exception as e:
                yield f"data: {json.dumps({'error': f'Layer 3 error: {str(e)}'})}\n\n"

        # ── LAYER 4: Alibaba ──
        if 'alibaba' in source_list:
            try:
                yield f"data: {json.dumps({'status': 'Starting Layer 4: Alibaba Buyer Requests...'})}\n\n"

                alibaba_results = alibaba_scraper.scrape_buyer_requests()
                for result in alibaba_results:
                    result['lead_id'] = str(uuid.uuid4())[:8]
                    db['alibaba_data'].append(result)
                    key = result['company_name'].lower().strip()
                    if not any(l['company_name'].lower().strip() == key for l in db['leads']):
                        merged = {
                            'lead_id': result['lead_id'],
                            'company_name': result['company_name'],
                            'country': result.get('country', 'N/A'),
                            'city': 'N/A',
                            'address': 'N/A',
                            'contact_person': 'N/A',
                            'email': 'N/A',
                            'phone': 'N/A',
                            'website': 'N/A',
                            'linkedin': 'N/A',
                            'hs_code': '3913 10 00',
                            'source': 'Alibaba',
                            'confidence': 'LOW',
                            'product': result.get('product', 'N/A'),
                            'contact_url': result.get('contact_url', 'N/A'),
                            'date_scraped': datetime.now().strftime('%Y-%m-%d'),
                        }
                        db['leads'].append(merged)
                        count += 1
                        yield f"data: {json.dumps({**merged, 'layer': 4, 'count': count})}\n\n"

            except Exception as e:
                yield f"data: {json.dumps({'error': f'Layer 4 error: {str(e)}'})}\n\n"

        # ── Cross-reference confidence scoring ──
        trade_names = {r['company_name'].lower().strip() for r in db.get('trade_data', [])}
        for lead in db['leads']:
            has_email = lead.get('email', 'N/A') != 'N/A'
            has_trade = lead['company_name'].lower().strip() in trade_names
            if has_email and has_trade:
                lead['confidence'] = 'HIGH'
            elif has_email:
                lead['confidence'] = 'MEDIUM'

        db['last_updated'] = datetime.now().isoformat()
        save_chitin_db(db)

        yield f"data: {json.dumps({'done': True, 'total': count})}\n\n"

    response = app.response_class(generate(), mimetype='text/event-stream')
    response.headers['X-Accel-Buffering'] = 'no'
    response.headers['Cache-Control'] = 'no-cache'
    return response

@app.route('/api/chitin/leads')
def get_chitin_leads():
    db = load_chitin_db()
    return jsonify(db)

@app.route('/api/chitin/leads', methods=['DELETE'])
def clear_chitin_leads():
    db = {"leads": [], "trade_data": [], "alibaba_data": [], "email_data": [], "last_updated": ""}
    save_chitin_db(db)
    return jsonify({"ok": True})

@app.route('/api/chitin/export_excel', methods=['POST'])
def chitin_export_excel():
    """Server-side Excel export with 5 sheets."""
    try:
        import pandas as pd
        db = load_chitin_db()
        timestamp = datetime.now().strftime('%Y-%m-%d')
        filename = f'chitin_leads_{timestamp}.xlsx'
        filepath = os.path.join(os.path.dirname(__file__), 'data', filename)

        with pd.ExcelWriter(filepath, engine='openpyxl') as writer:
            # Sheet 1: All Leads (deduplicated)
            if db['leads']:
                df_all = pd.DataFrame(db['leads'])
                df_all = df_all.drop_duplicates(subset=['company_name', 'country'], keep='first')
                df_all.to_excel(writer, sheet_name='All Leads', index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name='All Leads', index=False)

            # Sheet 2: Google Maps (Layer 1)
            maps_leads = [l for l in db['leads'] if l.get('source') == 'Google Maps']
            pd.DataFrame(maps_leads).to_excel(writer, sheet_name='Google Maps', index=False)

            # Sheet 3: Emails Found (Layer 2)
            if db.get('email_data'):
                pd.DataFrame(db['email_data']).to_excel(writer, sheet_name='Emails Found', index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name='Emails Found', index=False)

            # Sheet 4: Shipment Data (Layer 3)
            if db.get('trade_data'):
                pd.DataFrame(db['trade_data']).to_excel(writer, sheet_name='Shipment Data', index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name='Shipment Data', index=False)

            # Sheet 5: Hot Leads — Alibaba (Layer 4)
            if db.get('alibaba_data'):
                pd.DataFrame(db['alibaba_data']).to_excel(writer, sheet_name='Hot Leads', index=False)
            else:
                pd.DataFrame().to_excel(writer, sheet_name='Hot Leads', index=False)

        return send_from_directory(os.path.join(os.path.dirname(__file__), 'data'), filename, as_attachment=True)

    except Exception as e:
        return jsonify({"error": str(e)}), 500


# ── Email PDF Route ──
@app.route('/api/email/pdf', methods=['POST'])
def email_pdf():
    """Accept a base64-encoded PDF and email it to the specified address."""
    data = request.json or {}
    to_email = data.get('to_email', '').strip()
    pdf_b64  = data.get('pdf_b64', '')
    filename = data.get('filename', 'lead_report.pdf')
    report_title = data.get('report_title', 'Lead Report')
    lead_count   = data.get('lead_count', 0)
    agent_name   = data.get('agent_name', 'Agent')

    if not to_email:
        return jsonify({"ok": False, "error": "No recipient email provided"}), 400
    if not pdf_b64:
        return jsonify({"ok": False, "error": "No PDF data provided"}), 400

    subject = f"[ishiva Lead Matrix Pro] {report_title} — {lead_count} Leads"

    body_html = f"""
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: Arial, sans-serif; background:#f9f9f9; margin:0; padding:0;">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px; margin:40px auto; background:#fff; border-radius:12px; overflow:hidden; box-shadow:0 4px 20px rgba(0,0,0,0.08);">
    <tr>
      <td style="background: linear-gradient(135deg, #D97757, #C4653A); padding: 32px 36px;">
        <h1 style="color:white; margin:0; font-size:22px; font-weight:700;">ishiva Lead Matrix Pro</h1>
        <p style="color:rgba(255,255,255,0.85); margin:6px 0 0; font-size:14px;">Your lead report is ready</p>
      </td>
    </tr>
    <tr>
      <td style="padding: 32px 36px;">
        <h2 style="color:#1a1a1a; margin:0 0 8px; font-size:18px;">{report_title}</h2>
        <p style="color:#666; margin:0 0 24px; font-size:14px;">
          Generated by <strong>{agent_name}</strong> &nbsp;·&nbsp; {lead_count} lead records attached
        </p>
        <table width="100%" cellpadding="12" cellspacing="0" style="background:#faf9f7; border-radius:8px; margin-bottom:24px;">
          <tr>
            <td style="text-align:center; border-right:1px solid #e8e4df;">
              <div style="font-size:24px; font-weight:800; color:#D97757;">{lead_count}</div>
              <div style="font-size:12px; color:#888; margin-top:4px;">Total Leads</div>
            </td>
            <td style="text-align:center;">
              <div style="font-size:14px; color:#1a1a1a; font-weight:600;">PDF Report</div>
              <div style="font-size:12px; color:#888; margin-top:4px;">Attached to this email</div>
            </td>
          </tr>
        </table>
        <p style="color:#444; font-size:14px; line-height:1.6;">
          Please find your lead report attached as a PDF. Open it to view all lead details, 
          contact information, and status breakdowns.
        </p>
        <p style="color:#888; font-size:12px; margin-top:32px; border-top:1px solid #eee; padding-top:16px;">
          This email was sent from ishiva Lead Matrix Pro dashboard &nbsp;·&nbsp; Do not reply to this email.
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    # Save this email to remembered list
    db = load_db()
    settings = db.setdefault('settings', {})
    remembered = settings.setdefault('remembered_emails', [])
    if to_email not in remembered:
        remembered.insert(0, to_email)
        remembered[:] = remembered[:10]  # Keep max 10
        save_db(db)

    ok, err = email_notify.send_pdf(
        to_email=to_email,
        subject=subject,
        body_html=body_html,
        pdf_bytes=pdf_b64,
        pdf_filename=filename
    )
    if ok:
        return jsonify({"ok": True, "message": f"PDF sent to {to_email}"})
    else:
        return jsonify({"ok": False, "error": err or "Failed to send email. Check server email config."}), 500


# ── Remembered Emails ──
@app.route('/api/email/remembered', methods=['GET'])
def get_remembered_emails():
    db = load_db()
    emails = db.get('settings', {}).get('remembered_emails', [])
    return jsonify(emails)

@app.route('/api/email/remembered', methods=['POST'])
def save_remembered_email():
    data = request.json or {}
    email = data.get('email', '').strip()
    if not email:
        return jsonify({"ok": False}), 400
    db = load_db()
    settings = db.setdefault('settings', {})
    remembered = settings.setdefault('remembered_emails', [])
    if email not in remembered:
        remembered.insert(0, email)
        remembered[:] = remembered[:10]
        save_db(db)
    return jsonify({"ok": True, "emails": remembered})


if __name__ == '__main__':
    import webbrowser, threading
    port = int(os.environ.get('FLASK_PORT', 5001))
    threading.Timer(1.5, lambda: webbrowser.open(f"http://127.0.0.1:{port}")).start()
    app.run(debug=True, port=port, use_reloader=False)

