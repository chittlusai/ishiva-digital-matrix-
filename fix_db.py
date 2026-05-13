import json, os

db_path = 'data/db.json'

with open(db_path, 'r', encoding='utf-8') as f:
    raw = f.read()

try:
    obj = json.loads(raw)
    print('File is valid JSON, no fix needed')
    leads = obj.get('leads', [])
    print('Leads count:', len(leads))
except json.JSONDecodeError as e:
    print('Error at char', e.pos, ':', e.msg)
    decoder = json.JSONDecoder()
    try:
        obj, end_idx = decoder.raw_decode(raw)
        leads = obj.get('leads', [])
        print('First valid JSON ends at char', end_idx, 'of', len(raw))
        print('Extra data length:', len(raw) - end_idx)
        print('Leads count:', len(leads))
        print('Keys:', list(obj.keys()))
        # Backup
        backup_path = db_path + '.bak'
        with open(backup_path, 'w', encoding='utf-8') as bf:
            bf.write(raw)
        print('Backup saved to', backup_path)
        # Save fixed
        with open(db_path, 'w', encoding='utf-8') as f:
            json.dump(obj, f, indent=2, ensure_ascii=False)
        print('Fixed db.json saved successfully!')
    except Exception as e2:
        print('Could not auto-fix:', e2)
