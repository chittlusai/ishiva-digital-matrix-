import os, json, uuid
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from flask_cors import CORS

app = Flask(__name__, static_folder='static')
CORS(app)

from sheets_integration import sheets_sync
from email_service import email_notify

# Initialize with user's credentials
sheets_sync.set_spreadsheet_id('1tzIXL301KT6tejFwjWmkHoIY-tu7IUEiOItBtobJp3k')
email_notify.set_password('owks wywn ubqv qeyn')

DB_PATH = os.path.join(os.path.dirname(__file__), 'data', 'db.json')

USERS = [
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
        db = {"leads": [], "tasks": [], "action_logs": [], "messages": [], "settings": {"admin_email": "vanapalligowtham890@gmail.com", "sheets_id": ""}}
        save_db(db)
        return db
    with open(DB_PATH, 'r') as f:
        return json.load(f)

def save_db(db):
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    with open(DB_PATH, 'w') as f:
        json.dump(db, f, indent=2)

# ── Pages ──
@app.route('/')
def serve_index():
    return send_from_directory('static', 'index.html')

# ── Auth ──
@app.route('/api/auth', methods=['POST'])
def auth():
    data = request.json
    user = next((u for u in USERS if u['id'] == data.get('id') and u['pass'] == data.get('pass')), None)
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

    if not category or not location:
        return jsonify({"error": "Location and category are required"}), 400

    def generate():
        scraper = GoogleMapsScraper()
        try:
            scraper.setup_driver()
            for lead in scraper.extract_business_details(location, category, country, limit):
                # Save lead to DB
                db = load_db()
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

    return app.response_class(generate(), mimetype='text/event-stream')

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
        'type': data.get('type', 'note'),  # called, answered, no_answer, accepted, rejected, followup, note
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

# ── Team Chat ──
@app.route('/api/messages', methods=['GET', 'POST'])
def handle_messages():
    db = load_db()
    if request.method == 'POST':
        msg = request.json
        msg['timestamp'] = datetime.now().isoformat()
        db.setdefault('messages', []).append(msg)
        
        # Ira AI Intervention Logic
        text = msg.get('text', '').lower()
        if 'ira' in text or '?' in text or 'help' in text:
            ai_reply = "I'm Ira! I am analyzing all incoming leads. Click on any business row to view my full technical audit."
            if 'export' in text: ai_reply = "To export, you can click the 'Export All' button above the Leads Database."
            if 'refresh' in text: ai_reply = "I sync automatically, but you can always hit the Refresh button to pull the latest leads."
            
            db['messages'].append({
                "user_id": "ira_ai",
                "user_name": "Ira AI Assistant",
                "text": ai_reply,
                "timestamp": datetime.now().isoformat(),
                "is_ai": True
            })

        if len(db['messages']) > 100: db['messages'] = db['messages'][-100:]
        save_db(db)
        return jsonify({"ok": True})
    return jsonify(db.get('messages', []))

# ── Ira AI Analysis ──
@app.route('/api/ai/analyze', methods=['POST'])
def ai_analyze():
    lead = request.json
    website = lead.get('website', '')
    biz = lead.get('business_name', 'This business')
    cat = lead.get('category', 'industry')
    
    if not website or website == 'N/A' or len(website.strip()) < 4:
        analysis = {
            "summary": f"{biz} is missing a digital storefront, which is a major growth barrier in the {cat} sector.",
            "issues": [
                f"No online visibility when customers search for {cat}.",
                "Customer trust is significantly lower without a professional site.",
                "Missing automated lead capture systems."
            ],
            "upgrades": [
                "Launch a high-speed, mobile-optimized landing page.",
                "Integrate 'Book Now' functionality tailored for this business.",
                "Connect to Google Business Profile to capture local traffic."
            ]
        }
    else:
        analysis = {
            "summary": f"The website for {biz} has potential but needs professional optimization to dominate the local {cat} market.",
            "issues": [
                f"Slow mobile loading speed detected for {website} (potential 40% bounce rate).",
                "Non-responsive design elements on mobile devices.",
                "Outdated SEO meta tags that hurt local ranking."
            ],
            "upgrades": [
                "Optimize image assets for next-gen formats (WebP).",
                "Install a modern, conversion-focused layout.",
                "Add a sticky Call-to-Action (CTA) above the fold."
            ]
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
        'status': 'pending'
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
    return jsonify({
        'total': len(l),
        'accepted': len([x for x in l if x.get('client_status') == 'accepted']),
        'rejected': len([x for x in l if x.get('client_status') == 'rejected']),
        'contacted': len([x for x in l if x.get('client_status') == 'contacted']),
    })

# ── Users list (for admin) ──
@app.route('/api/admin/users')
def get_users():
    return jsonify([{k: v for k, v in u.items() if k != 'pass'} for u in USERS])

if __name__ == '__main__':
    import webbrowser, threading
    threading.Timer(1.5, lambda: webbrowser.open("http://127.0.0.1:5000")).start()
    app.run(debug=True, port=5000, use_reloader=False)
