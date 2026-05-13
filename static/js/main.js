// ishiva Lead Matrix Pro v6.0 - Enterprise Edition
let allLeads=[], dbLeads=[], openLeadId=null, activeTab='scraper', activeChannel='general';
let currentUser=JSON.parse(localStorage.getItem('lm_user')) || null;
let chatInterval=null, lastMsgCount=0;
let selectMode=false, selectedLeadIds=new Set();

// ── CUSTOM SELECT UI ──
function initCustomSelects() {
    document.querySelectorAll('select').forEach(setupCustomSelect);
}

function setupCustomSelect(select) {
    if(select.nextElementSibling && select.nextElementSibling.classList.contains('custom-select-wrapper')) {
        select.nextElementSibling.remove();
    }
    select.style.display = 'none';
    
    const wrapper = document.createElement('div');
    wrapper.className = 'custom-select-wrapper';
    
    const trigger = document.createElement('div');
    trigger.className = 'custom-select-trigger';
    const triggerText = document.createElement('span');
    triggerText.innerText = select.options[select.selectedIndex]?.innerText || 'Select...';
    trigger.appendChild(triggerText);
    
    // Add SVG without breaking triggerText reference
    const svgStr = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>';
    trigger.insertAdjacentHTML('beforeend', svgStr);
    
    const optionsCont = document.createElement('div');
    optionsCont.className = 'custom-options';
    
    const isSearchable = select.hasAttribute('data-search');
    let searchInput = null;
    
    if(isSearchable) {
        const searchBox = document.createElement('div');
        searchBox.style.padding = '0.5rem';
        searchBox.style.position = 'sticky';
        searchBox.style.top = '0';
        searchBox.style.background = 'var(--bg2)';
        searchBox.style.zIndex = '2';
        searchBox.style.borderBottom = '1px solid var(--border)';
        
        searchInput = document.createElement('input');
        searchInput.type = 'text';
        searchInput.className = 'custom-select-search';
        searchInput.placeholder = 'Type to search...';
        
        searchInput.addEventListener('click', e => e.stopPropagation());
        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.toLowerCase();
            let currentGroup = null;
            let groupHasVisible = false;
            
            Array.from(optionsCont.children).forEach(child => {
                if(child === searchBox) return;
                
                if(child.classList.contains('custom-optgroup')) {
                    if(currentGroup) currentGroup.style.display = groupHasVisible ? 'block' : 'none';
                    currentGroup = child;
                    groupHasVisible = false;
                } else if(child.classList.contains('custom-option')) {
                    if(child.innerText.toLowerCase().includes(query)) {
                        child.style.display = 'block';
                        groupHasVisible = true;
                    } else {
                        child.style.display = 'none';
                    }
                }
            });
            if(currentGroup) currentGroup.style.display = groupHasVisible ? 'block' : 'none';
        });
        
        searchBox.appendChild(searchInput);
        optionsCont.appendChild(searchBox);
    }
    
    Array.from(select.children).forEach(child => {
        if(child.tagName === 'OPTGROUP') {
            const grp = document.createElement('div');
            grp.className = 'custom-optgroup';
            grp.innerText = child.label;
            optionsCont.appendChild(grp);
            Array.from(child.children).forEach(opt => {
                optionsCont.appendChild(createCustomOption(opt, select, triggerText, wrapper));
            });
        } else if(child.tagName === 'OPTION') {
            optionsCont.appendChild(createCustomOption(child, select, triggerText, wrapper));
        }
    });
    
    wrapper.appendChild(trigger);
    wrapper.appendChild(optionsCont);
    select.parentNode.insertBefore(wrapper, select.nextSibling);
    
    trigger.addEventListener('click', (e) => {
        e.stopPropagation();
        const isOpen = wrapper.classList.contains('open');
        document.querySelectorAll('.custom-select-wrapper').forEach(w => {
            w.classList.remove('open');
            w.querySelector('.custom-select-trigger').classList.remove('open');
        });
        if(!isOpen) {
            wrapper.classList.add('open');
            trigger.classList.add('open');
            if(searchInput) {
                setTimeout(() => searchInput.focus(), 50);
            }
        }
    });
}

function createCustomOption(opt, select, triggerText, wrapper) {
    const div = document.createElement('div');
    div.className = 'custom-option' + (opt.selected ? ' selected' : '');
    div.innerText = opt.innerText;
    div.addEventListener('click', (e) => {
        e.stopPropagation();
        select.value = opt.value;
        triggerText.innerText = opt.innerText;
        wrapper.querySelectorAll('.custom-option').forEach(o => o.classList.remove('selected'));
        div.classList.add('selected');
        wrapper.classList.remove('open');
        wrapper.querySelector('.custom-select-trigger').classList.remove('open');
        select.dispatchEvent(new Event('change'));
    });
    return div;
}

document.addEventListener('click', () => {
    document.querySelectorAll('.custom-select-wrapper').forEach(w => {
        w.classList.remove('open');
        w.querySelector('.custom-select-trigger').classList.remove('open');
    });
});

document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    initNav();
    initWizard();
    initScraper();
    initDetail();
    initChat();
    initFiltersAndSearch();
    initModals();
});

// ── AUTHENTICATION ──
function initAuth() {
    const setupSession = () => {
        document.getElementById('loginWrapper').style.opacity = '0';
        setTimeout(() => document.getElementById('loginWrapper').style.display = 'none', 300);
        
        const app = document.getElementById('app');
        app.style.opacity = '1'; app.style.pointerEvents = 'auto';
        
        document.getElementById('uName').innerText = currentUser.name;
        document.getElementById('uRole').innerText = currentUser.role;
        document.getElementById('uAvatar').innerText = currentUser.name.charAt(0);
        
        // Set greeting
        const hour = new Date().getHours();
        const greeting = hour < 12 ? 'Good morning' : (hour < 18 ? 'Good afternoon' : 'Good evening');
        const greetEl = document.getElementById('greetingText');
        if(greetEl) greetEl.innerText = `${greeting}, ${currentUser.name.split(' ')[0]}!`;
        
        document.querySelectorAll('.admin-only').forEach(el => {
            if(currentUser.role === 'admin') {
                // Show all admin-only elements that aren't the special nav items managed elsewhere
                el.style.display = '';
            } else {
                el.style.display = 'none';
            }
        });
        
        initCustomSelects();
        loadDbLeads();
        startChatSync();
    };

    if (currentUser) {
        setupSession();
    } else {
        document.getElementById('loginWrapper').style.display = 'flex';
    }

    document.getElementById('loginForm').onsubmit = async (e) => {
        e.preventDefault();
        const id = document.getElementById('authId').value;
        const pass = document.getElementById('authPass').value;
        const btn = e.target.querySelector('button');
        btn.innerHTML = '<svg class="icon spin"><use href="#i-refresh"/></svg> Authenticating...';
        
        try {
            const r = await fetch('/api/auth', { method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify({id, pass})});
            const d = await r.json();
            
            if(d.ok) {
                currentUser = d.user;
                localStorage.setItem('lm_user', JSON.stringify(currentUser));
                toast('success', `Welcome back, ${currentUser.name}`);
                setupSession();
            } else {
                showLoginError();
                btn.innerHTML = 'Sign In to Workspace';
            }
        } catch(err) {
            showLoginError();
            btn.innerHTML = 'Sign In to Workspace';
        }
    };
    document.getElementById('logoutBtn').onclick = () => {
        localStorage.removeItem('lm_user');
        location.reload();
    };
}

function showLoginError() {
    const err = document.getElementById('loginError');
    err.style.display = 'block';
    setTimeout(() => err.style.display = 'none', 3000);
}

// ── NAVIGATION ──
function initNav() {
    document.querySelectorAll('.nav-tab').forEach(tab => {
        // Skip chitin tab — it opens in a new window via its own onclick
        if(tab.id === 'chitinTabBtn') return;
        tab.onclick = () => {
            const target = tab.dataset.tab;
            if(target === activeTab) return;
            
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
            document.getElementById('panel-'+target).classList.add('active');
            
            // Update breadcrumb
            const titles = {
                'scraper': 'Lead Scraper', 'leads': 'Database', 'pipeline': 'Pipeline Board',
                'tasks': 'My Schedule', 'chat': 'Conversations', 'admin': 'Admin Portal'
            };
            document.getElementById('topTitle').innerText = titles[target];
            
            // Action buttons visibility
            document.getElementById('pdfBtn').style.display = (target==='scraper' && allLeads.length) ? '' : 'none';
            
            activeTab = target;
            
            if(target === 'leads') loadDbLeads();
            if(target === 'pipeline') loadPipeline();
            if(target === 'tasks') loadTasks();
            if(target === 'admin') loadAdminStats();
            if(target === 'chat') {
                document.getElementById('chatBadge').style.display = 'none';
                scrollToBottomChat();
            }
        };
    });
}

// ── WIZARD (SCRAPER) ──
function initWizard() {
    document.querySelectorAll('.next-step, .prev-step').forEach(btn => {
        btn.onclick = (e) => {
            if(btn.type === 'submit') return;
            const target = btn.dataset.target;
            const currentPanel = btn.closest('.wizard-panel');
            
            // Validation
            if(btn.classList.contains('next-step')) {
                const select = currentPanel.querySelector('select, input');
                if(select && !select.value) {
                    toast('error', 'Please make a selection first');
                    return;
                }
            }
            
            currentPanel.classList.remove('active');
            document.getElementById(target).classList.add('active');
            
            // Expand animation
            const heroWrapper = document.getElementById('scraperHero');
            const wizTitle = document.getElementById('wizardTitle');
            const wizSteps = document.getElementById('wizardSteps');
            
            if(target === 'wp1') {
                if(heroWrapper) heroWrapper.classList.remove('expanded');
                if(wizTitle) { wizTitle.style.opacity = '0'; setTimeout(()=>wizTitle.style.display='none', 400); }
                if(wizSteps) { wizSteps.style.opacity = '0'; setTimeout(()=>wizSteps.style.display='none', 400); }
            } else {
                if(heroWrapper) heroWrapper.classList.add('expanded');
                if(wizTitle) { wizTitle.style.display = 'block'; setTimeout(()=>wizTitle.style.opacity='1', 50); }
                if(wizSteps) { wizSteps.style.display = 'flex'; setTimeout(()=>wizSteps.style.opacity='1', 50); }
            }
            
            // Update timeline
            const stepNum = target.replace('wp', 'wStep');
            document.querySelectorAll('.step').forEach(s => s.classList.remove('active', 'completed'));
            
            const curIdx = parseInt(target.replace('wp', ''));
            for(let i=1; i<=4; i++) {
                const s = document.getElementById('wStep'+i);
                if(i < curIdx) s.classList.add('completed');
                if(i === curIdx) s.classList.add('active');
            }
        };
    });

    // Auto-advance on selection
    document.querySelectorAll('.wizard-panel select').forEach(select => {
        select.addEventListener('change', () => {
            if(select.value) {
                const nextBtn = select.closest('.wizard-panel').querySelector('.next-step');
                if(nextBtn) {
                    setTimeout(() => nextBtn.click(), 300); // Small delay for visual feedback
                }
            }
        });
    });
}

// ── SCRAPER CORE ──
function initScraper() {
    document.getElementById('scrapeForm').onsubmit = (e) => {
        e.preventDefault();
        
        allLeads = [];
        const tbody = document.getElementById('scraperBody');
        tbody.innerHTML = '';
        
        // Add skeleton rows
        for(let i=0; i<5; i++) {
            tbody.innerHTML += `<tr class="skeleton-row"><td><div class="skeleton-bar w-3-4"></div></td><td><div class="skeleton-bar w-1-2"></div></td><td><div class="skeleton-bar w-full"></div></td><td><div class="skeleton-bar w-1-2"></div></td><td><div class="skeleton-bar w-3-4"></div></td><td><div class="skeleton-bar w-1-2"></div></td><td><div class="skeleton-bar w-full"></div></td></tr>`;
        }
        
        document.getElementById('searchBtn').disabled = true;
        document.getElementById('searchBtn').innerHTML = '<svg class="icon spin"><use href="#i-refresh"/></svg> Extracting...';
        
        const heroWrapper = document.getElementById('scraperHero');
        if(heroWrapper) heroWrapper.style.display = 'none';
        
        document.querySelector('.wizard-card').style.display = 'none';
        document.getElementById('scraperResultsArea').style.display = 'flex';
        document.getElementById('pdfBtn').style.display = 'inline-flex';
        
        const loc = document.getElementById('location').value;
        const cat = document.getElementById('category').value;
        const country = document.getElementById('country').value;
        const limit = document.getElementById('limit').value;
        
        document.getElementById('limTotal').innerText = limit;
        document.getElementById('progressBar').style.width = '0%';
        
        const params = new URLSearchParams({ location: loc, category: cat, country: country, limit: limit, agent: currentUser.name });
        
        const es = new EventSource(`/api/scrape_stream?${params}`);
        es.onmessage = (ev) => {
            const data = JSON.parse(ev.data);
            
            if(data.done) {
                es.close();
                document.getElementById('searchBtn').disabled = false;
                document.getElementById('progressStatus').innerText = 'Extraction Complete';
                document.getElementById('progressStatus').style.color = 'var(--success)';
                toast('success', `Successfully extracted ${allLeads.length} leads.`);
                // Remove any remaining skeletons
                tbody.querySelectorAll('.skeleton-row').forEach(r => r.remove());
                return;
            }
            
            if(data.error) {
                es.close();
                toast('error', `Error: ${data.error}`);
                return;
            }
            
            if(data.status) {
                document.getElementById('progressStatus').innerText = data.status;
                return;
            }
            
            // First real data, remove skeletons
            if(allLeads.length === 0) tbody.innerHTML = '';
            
            allLeads.push(data);
            renderScraperRow(data, tbody);
            
            // Update Progress & Stats
            const pct = Math.min((allLeads.length / limit) * 100, 100);
            document.getElementById('progressBar').style.width = `${pct}%`;
            document.getElementById('curCount').innerText = allLeads.length;
            
            document.getElementById('sTotal').innerText = allLeads.length;
            document.getElementById('sHot').innerText = allLeads.filter(l => l.priority && l.priority.includes('HIGH')).length;
            document.getElementById('sTop').innerText = allLeads.filter(l => parseFloat(l.rating) >= 4).length;
        };
        
        es.onerror = () => {
            es.close();
            document.getElementById('searchBtn').disabled = false;
            toast('error', 'Connection lost to scraper engine.');
        };
    };
    // Dynamic Location Dropdown
    const countryEl = document.getElementById('country');
    const locationEl = document.getElementById('location');
    
    const updateLocations = () => {
        const country = countryEl.value;
        const locData = {
            'India': {
                'Andhra Pradesh': ['Visakhapatnam', 'Vijayawada', 'Guntur', 'Nellore', 'Kurnool', 'Rajahmundry', 'Tirupati', 'Kakinada'],
                'Telangana': ['Hyderabad', 'Warangal', 'Nizamabad', 'Khammam', 'Karimnagar', 'Ramagundam'],
                'Maharashtra': ['Mumbai', 'Pune', 'Nagpur', 'Thane', 'Nashik', 'Aurangabad', 'Solapur'],
                'Delhi': ['New Delhi'],
                'Karnataka': ['Bangalore', 'Mysore', 'Hubli', 'Mangalore', 'Belagavi', 'Davangere'],
                'Tamil Nadu': ['Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem', 'Tirunelveli'],
                'Gujarat': ['Ahmedabad', 'Surat', 'Vadodara', 'Rajkot', 'Bhavnagar', 'Jamnagar'],
                'West Bengal': ['Kolkata', 'Asansol', 'Siliguri', 'Durgapur', 'Bardhaman'],
                'Uttar Pradesh': ['Lucknow', 'Kanpur', 'Ghaziabad', 'Agra', 'Varanasi', 'Meerut', 'Allahabad', 'Noida'],
                'Rajasthan': ['Jaipur', 'Jodhpur', 'Kota', 'Bikaner', 'Ajmer', 'Udaipur'],
                'Kerala': ['Thiruvananthapuram', 'Kochi', 'Kozhikode', 'Thrissur', 'Kollam'],
                'Madhya Pradesh': ['Indore', 'Bhopal', 'Jabalpur', 'Gwalior', 'Ujjain'],
                'Punjab': ['Ludhiana', 'Amritsar', 'Jalandhar', 'Patiala', 'Bathinda'],
                'Haryana': ['Faridabad', 'Gurugram', 'Panipat', 'Ambala', 'Yamunanagar'],
                'Bihar': ['Patna', 'Gaya', 'Bhagalpur', 'Muzaffarpur', 'Purnia']
            },
            'USA': {
                'California': ['Los Angeles', 'San Francisco', 'San Diego', 'San Jose', 'Sacramento', 'Fresno'],
                'Texas': ['Houston', 'San Antonio', 'Dallas', 'Austin', 'Fort Worth', 'El Paso'],
                'New York': ['New York City', 'Buffalo', 'Rochester', 'Yonkers', 'Syracuse', 'Albany'],
                'Florida': ['Miami', 'Orlando', 'Tampa', 'Jacksonville', 'Tallahassee', 'Fort Lauderdale'],
                'Illinois': ['Chicago', 'Aurora', 'Naperville', 'Joliet', 'Springfield', 'Peoria'],
                'Pennsylvania': ['Philadelphia', 'Pittsburgh', 'Allentown', 'Erie', 'Reading'],
                'Ohio': ['Columbus', 'Cleveland', 'Cincinnati', 'Toledo', 'Akron', 'Dayton'],
                'Georgia': ['Atlanta', 'Augusta', 'Columbus', 'Macon', 'Savannah', 'Athens'],
                'Washington': ['Seattle', 'Spokane', 'Tacoma', 'Vancouver', 'Bellevue', 'Everett'],
                'Colorado': ['Denver', 'Colorado Springs', 'Aurora', 'Fort Collins', 'Lakewood', 'Boulder'],
                'Arizona': ['Phoenix', 'Tucson', 'Mesa', 'Chandler', 'Scottsdale'],
                'Nevada': ['Las Vegas', 'Henderson', 'Reno', 'North Las Vegas', 'Sparks']
            }
        };
        
        const data = locData[country] || {};
        let html = '<option value="">Select a location...</option>';
        
        for(const state in data) {
            html += `<optgroup label="${state}">`;
            html += `<option value="${state}">${state} (Entire State)</option>`;
            data[state].forEach(city => {
                html += `<option value="${city}, ${state}">${city}</option>`;
            });
            html += `</optgroup>`;
        }
        
        locationEl.innerHTML = html;
        setupCustomSelect(locationEl);
    };
    
    if(countryEl && locationEl) {
        countryEl.addEventListener('change', updateLocations);
        updateLocations(); // Initialize on load
    }
    
    // ── Export Studio ──
    initExportStudio();

    document.getElementById('pdfBtn').onclick = () => exportQuick(allLeads, 'scraper_leads');
}

// ── Quick PDF (Scraper tab) ──
function exportQuick(leads, filename) {
    if(!leads.length) { toast('error', 'No leads to export'); return; }
    try {
        toast('info', 'Generating PDF...');
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF('l', 'mm', 'a4');
        buildPdf(doc, leads, {
            title: 'Scraper Results', theme: 'coral', orientation: 'l',
            cols: ['business_name','phone','website','category','location','rating','client_status']
        });
        doc.save(`${filename}_${Date.now()}.pdf`);
        toast('success', 'PDF Downloaded!');
    } catch(e) { console.error(e); toast('error', 'Failed to generate PDF'); }
}

// ── Export Studio logic ──
function initExportStudio() {
    const btn = document.getElementById('exportStudioBtn');
    if(!btn) return;

    btn.onclick = () => openExportStudio();

    // Column toggles
    document.querySelectorAll('.col-toggle').forEach(lbl => {
        lbl.onclick = () => {
            const cb = lbl.querySelector('input[type=checkbox]');
            cb.checked = !cb.checked;
            lbl.classList.toggle('active', cb.checked);
            updateExportPreview();
        };
    });

    // Scope cards
    document.querySelectorAll('.export-scope-card').forEach(card => {
        card.onclick = () => {
            if(card.classList.contains('disabled')) return;
            document.querySelectorAll('.export-scope-card').forEach(c => {
                c.classList.remove('active');
                c.querySelector('input[type=radio]').checked = false;
            });
            card.classList.add('active');
            card.querySelector('input[type=radio]').checked = true;
            updateExportPreview();
        };
    });

    // Generate button
    document.getElementById('exportGenerateBtn').onclick = () => runExportStudio('download');
    document.getElementById('exportEmailBtn').onclick = () => runExportStudio('email');
    document.getElementById('exportCancelBtn').onclick = () => {
        document.getElementById('exportStudioModal').classList.remove('open');
    };
}

function openExportStudio() {
    // Count leads for each scope
    const allCount = dbLeads.length;
    const filteredLeads = getFilteredDbLeads();
    const filteredCount = filteredLeads.length;
    const selectedCount = selectedLeadIds.size;

    document.getElementById('scopeCountAll').innerText = allCount;
    document.getElementById('scopeCountFiltered').innerText = filteredCount;
    document.getElementById('scopeCountSelected').innerText = selectedCount;

    // Disable "Selected" if none selected
    const selCard = document.getElementById('scopeCardSelected');
    if(selectedCount === 0) {
        selCard.classList.add('disabled');
        selCard.querySelector('input').disabled = true;
        if(selCard.classList.contains('active')) {
            selCard.classList.remove('active');
            document.querySelector('.export-scope-card[data-scope="all"]').classList.add('active');
            document.getElementById('scope_all').checked = true;
        }
    } else {
        selCard.classList.remove('disabled');
        selCard.querySelector('input').disabled = false;
    }

    updateExportPreview();
    document.getElementById('exportStudioModal').classList.add('open');
    
    // Load remembered emails
    loadRememberedEmails();
}

async function loadRememberedEmails() {
    try {
        const r = await fetch('/api/email/remembered');
        const emails = await r.json();
        
        // Populate datalist
        const dl = document.getElementById('rememberedEmailsList');
        if(dl) dl.innerHTML = emails.map(e => `<option value="${e}">`).join('');
        
        // Show clickable chips for quick-fill
        const chips = document.getElementById('rememberedEmailChips');
        if(chips) {
            chips.innerHTML = emails.slice(0, 5).map(e => `
                <span onclick="document.getElementById('exportEmailInput').value='${e}'" 
                      style="display:inline-flex; align-items:center; gap:0.3rem; padding:0.2rem 0.6rem; background:#dcfce7; border:1px solid #86efac; border-radius:20px; font-size:0.72rem; cursor:pointer; color:#15803d; transition:all 0.15s;"
                      onmouseover="this.style.background='#bbf7d0'" onmouseout="this.style.background='#dcfce7'">
                    <svg style="width:10px;height:10px;stroke:#15803d;fill:none;stroke-width:2;stroke-linecap:round;stroke-linejoin:round;"><use href="#i-mail"/></svg>
                    ${e}
                </span>
            `).join('');
        }
    } catch(e) {}
}

function getExportLeads(scope) {
    if(scope === 'all') return dbLeads;
    if(scope === 'filtered') return getFilteredDbLeads();
    if(scope === 'selected') return dbLeads.filter(l => selectedLeadIds.has(l.lead_id));
    return dbLeads;
}

function getFilteredDbLeads() {
    const filter = (document.querySelector('.filter-chip[data-dbf].active') || {dataset:{dbf:'all'}}).dataset.dbf;
    const search = (document.getElementById('dbSearch') || {value:''}).value.toLowerCase();
    return dbLeads.filter(l => {
        if(filter !== 'all') {
            const st = l.client_status || 'new';
            if(filter === 'contacted' && !['contacted','answered','called'].includes(st)) return false;
            if(filter !== 'contacted' && st !== filter) return false;
        }
        if(search) {
            const term = `${l.business_name} ${l.phone} ${l.agent}`.toLowerCase();
            if(!term.includes(search)) return false;
        }
        return true;
    });
}

function updateExportPreview() {
    const scope = document.querySelector('input[name="exportScope"]:checked');
    if(!scope) return;

    let count = 0, label = '';
    if(scope.value === 'all') { count = dbLeads.length; label = 'All leads in database'; }
    else if(scope.value === 'filtered') { count = getFilteredDbLeads().length; label = 'Current filtered view'; }
    else if(scope.value === 'selected') { count = selectedLeadIds.size; label = 'Manually selected leads'; }

    const cols = document.querySelectorAll('#columnSelector input:checked').length;
    document.getElementById('exportPreviewText').innerText = `${label} · ${cols} column${cols !== 1 ? 's' : ''}`;
    document.getElementById('exportPreviewCount').innerText = `${count} lead${count !== 1 ? 's' : ''}`;
}

function runExportStudio(mode = 'download') {
    const scope = document.querySelector('input[name="exportScope"]:checked')?.value || 'all';
    const theme = document.getElementById('exportTheme')?.value || 'coral';
    const orientation = document.getElementById('exportOrientation')?.value || 'l';
    const title = document.getElementById('exportTitle')?.value.trim() || 'Lead Report';
    const cols = Array.from(document.querySelectorAll('#columnSelector input:checked')).map(cb => cb.value);
    const toEmail = document.getElementById('exportEmailInput')?.value.trim() || '';

    if(!cols.length) { toast('error', 'Select at least one column'); return; }
    
    const leads = getExportLeads(scope);
    if(!leads.length) { toast('error', 'No leads match the selected scope'); return; }
    
    if(mode === 'email' && !toEmail) {
        toast('error', 'Enter a recipient email address first');
        document.getElementById('exportEmailInput')?.focus();
        return;
    }

    const genBtn = document.getElementById('exportGenerateBtn');
    const emailBtn = document.getElementById('exportEmailBtn');
    const activeBtn = mode === 'email' ? emailBtn : genBtn;
    const origHtml = activeBtn.innerHTML;
    activeBtn.innerHTML = '<svg class="icon spin icon-sm"><use href="#i-refresh"/></svg> Building...';
    activeBtn.disabled = true;

    setTimeout(async () => {
        try {
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF(orientation, 'mm', 'a4');
            buildPdf(doc, leads, { title, theme, orientation, cols });
            const safeName = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
            const filename = `${safeName}_${Date.now()}.pdf`;

            if(mode === 'email') {
                // Get base64 PDF
                const pdfB64 = doc.output('datauristring').split(',')[1];
                activeBtn.innerHTML = '<svg class="icon spin icon-sm"><use href="#i-refresh"/></svg> Sending...';
                const resp = await fetch('/api/email/pdf', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        to_email: toEmail, pdf_b64: pdfB64,
                        filename, report_title: title,
                        lead_count: leads.length,
                        agent_name: currentUser?.name || 'Agent'
                    })
                });
                const result = await resp.json();
                if(result.ok) {
                    toast('success', `PDF sent to ${toEmail}`);
                    document.getElementById('exportStudioModal').classList.remove('open');
                    loadRememberedEmails(); // refresh chips
                } else {
                    toast('error', result.error || 'Email send failed');
                }
            } else {
                doc.save(filename);
                toast('success', `PDF downloaded — ${leads.length} leads!`);
                document.getElementById('exportStudioModal').classList.remove('open');
            }
        } catch(e) {
            console.error(e);
            toast('error', 'Failed to generate PDF');
        }
        activeBtn.innerHTML = origHtml;
        activeBtn.disabled = false;
    }, 50);
}

// ── Professional PDF Builder ──
function buildPdf(doc, leads, { title, theme, orientation, cols }) {
    const isLandscape = orientation === 'l';
    const pageW = isLandscape ? 297 : 210;
    const pageH = isLandscape ? 210 : 297;
    const margin = 14;

    const themes = {
        coral:  { h1: [217,119,87],  h2: [196,101,58],  accent: [217,119,87],  light: [255,242,237] },
        indigo: { h1: [99,102,241],  h2: [79,70,229],   accent: [99,102,241],  light: [238,242,255] },
        teal:   { h1: [13,148,136],  h2: [11,128,118],  accent: [13,148,136],  light: [240,253,250] },
        dark:   { h1: [30,30,46],    h2: [20,20,36],    accent: [139,92,246],  light: [245,243,255] }
    };
    const T = themes[theme] || themes.coral;

    // ── PAGE 1: Cover / Summary ──
    // Background header block
    doc.setFillColor(...T.h1);
    doc.rect(0, 0, pageW, 52, 'F');

    // Decorative accent stripe
    doc.setFillColor(...T.h2);
    doc.rect(0, 48, pageW, 4, 'F');

    // Brand + title
    doc.setTextColor(255, 255, 255);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'bold');
    doc.text('ISHIVA LEAD MATRIX PRO', margin, 14);
    doc.setFontSize(22);
    doc.text(title, margin, 30);
    doc.setFontSize(9);
    doc.setFont('helvetica', 'normal');
    const meta = `Generated by ${currentUser?.name || 'Agent'}  ·  ${new Date().toLocaleString()}  ·  ${leads.length} Records`;
    doc.text(meta, margin, 43);

    // ── Summary Stats Row ──
    const total   = leads.length;
    const accepted = leads.filter(l => l.client_status === 'accepted').length;
    const contacted = leads.filter(l => ['contacted','called','answered'].includes(l.client_status)).length;
    const newLeads  = leads.filter(l => (l.client_status || 'new') === 'new').length;
    const hotLeads  = leads.filter(l => (l.priority||'').includes('HIGH')).length;
    const convRate  = total ? Math.round((accepted/total)*100) : 0;

    const statsY = 62;
    const statW  = (pageW - margin*2) / 5;
    const stats  = [
        { label: 'Total Leads',   value: total,     color: T.h1 },
        { label: 'New Leads',     value: newLeads,  color: [100,100,120] },
        { label: 'Contacted',     value: contacted, color: [37,99,235] },
        { label: 'Accepted',      value: accepted,  color: [22,163,74] },
        { label: 'Conversion',    value: convRate+'%', color: T.h1 }
    ];

    stats.forEach((s, i) => {
        const x = margin + i * statW;
        doc.setFillColor(...T.light);
        doc.roundedRect(x, statsY, statW - 3, 26, 3, 3, 'F');
        doc.setTextColor(...s.color);
        doc.setFontSize(16); doc.setFont('helvetica', 'bold');
        doc.text(String(s.value), x + (statW-3)/2, statsY + 14, { align: 'center' });
        doc.setFontSize(7); doc.setFont('helvetica', 'normal');
        doc.setTextColor(120, 120, 120);
        doc.text(s.label, x + (statW-3)/2, statsY + 22, { align: 'center' });
    });

    // ── Hot leads note (no emoji — jsPDF doesn't support emoji) ──
    if(hotLeads > 0) {
        const noteY = statsY + 32;
        doc.setFillColor(255,237,213);
        doc.roundedRect(margin, noteY, pageW - margin*2, 10, 2, 2, 'F');
        doc.setTextColor(180, 80, 0);
        doc.setFontSize(8); doc.setFont('helvetica', 'bold');
        doc.text(`[HIGH PRIORITY] ${hotLeads} high-priority leads (no website) -- highest conversion potential`, margin + 5, noteY + 6.5);
    }

    // ── Data Table ──
    const colDefs = {
        business_name: { header: 'Business Name', width: 50 },
        phone:         { header: 'Phone',         width: 28 },
        website:       { header: 'Website',       width: 45 },
        category:      { header: 'Category',      width: 28 },
        location:      { header: 'Location',      width: 32 },
        rating:        { header: 'Rating',        width: 14 },
        client_status: { header: 'Status',        width: 22 },
        agent:         { header: 'Agent',         width: 28 },
        notes:         { header: 'Notes',         width: 40 }
    };

    const selectedCols = cols.filter(c => colDefs[c]);
    const headers = selectedCols.map(c => colDefs[c].header);

    const statusColors = {
        accepted:  [22,163,74],  rejected:  [220,38,38],
        contacted: [37,99,235],  called:    [37,99,235],  answered: [37,99,235],
        followup:  [124,58,237], no_answer: [217,119,6],  new:      [100,100,120]
    };

    const rows = leads.map(l => selectedCols.map(c => {
        if(c === 'client_status') return (l[c] || 'new').replace('_',' ').toUpperCase();
        if(c === 'website' && l[c] && l[c] !== 'N/A') {
            try { return new URL(l[c]).hostname.replace('www.',''); } catch(e) { return l[c]; }
        }
        return l[c] || 'N/A';
    }));

    const tableStartY = statsY + (hotLeads > 0 ? 46 : 32);

    doc.autoTable({
        head: [headers],
        body: rows,
        startY: tableStartY,
        theme: 'grid',
        headStyles: {
            fillColor: T.h1, textColor: 255,
            fontSize: 8, fontStyle: 'bold', halign: 'center',
            cellPadding: { top: 4, bottom: 4, left: 3, right: 3 }
        },
        bodyStyles: { fontSize: 7.5, cellPadding: 3, textColor: [50,50,60], valign: 'middle' },
        alternateRowStyles: { fillColor: [252, 251, 250] },
        columnStyles: (() => {
            const cs = {};
            selectedCols.forEach((c, i) => {
                cs[i] = { cellWidth: colDefs[c].width };
                if(c === 'business_name') cs[i].fontStyle = 'bold';
                if(c === 'website') cs[i].textColor = [37,99,235];
            });
            return cs;
        })(),
        didParseCell: (data) => {
            const colIdx = selectedCols.indexOf('client_status');
            if(colIdx !== -1 && data.column.index === colIdx && data.section === 'body') {
                const rawStatus = (leads[data.row.index]?.client_status || 'new');
                const color = statusColors[rawStatus] || [100,100,120];
                data.cell.styles.textColor = color;
                data.cell.styles.fontStyle = 'bold';
            }
        },
        didDrawCell: (data) => {
            const colIdx = selectedCols.indexOf('website');
            if(colIdx !== -1 && data.column.index === colIdx && data.section === 'body') {
                const lead = leads[data.row.index];
                if(lead?.website && lead.website !== 'N/A') {
                    doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url: lead.website });
                }
            }
        },
        margin: { left: margin, right: margin },
        showHead: 'everyPage',
        didDrawPage: (data) => {
            // Footer on every page
            const pageCount = doc.getNumberOfPages();
            const curPage = data.pageNumber;
            doc.setFontSize(7);
            doc.setTextColor(160,160,160);
            doc.setFont('helvetica', 'normal');
            doc.text(`ishiva Lead Matrix Pro  ·  ${title}`, margin, pageH - 6);
            doc.text(`Page ${curPage} of ${pageCount}`, pageW - margin, pageH - 6, { align: 'right' });
            doc.setDrawColor(...T.h1);
            doc.setLineWidth(0.4);
            doc.line(margin, pageH - 10, pageW - margin, pageH - 10);
        }
    });
}

// Stub for old exportAllBtn compatibility (now replaced by exportStudioBtn)
function exportHandler() {}


function renderScraperRow(l, tbody) {
    const tr = document.createElement('tr');
    const pClass = l.priority && l.priority.includes('HIGH') ? 'badge-high' : 'badge-med';
    const webLink = l.website !== 'N/A' ? `<a href="${l.website}" target="_blank" class="td-link" onclick="event.stopPropagation()">Visit Site</a>` : '—';
    
    tr.innerHTML = `
        <td class="td-main">${l.business_name}</td>
        <td>${l.phone}</td>
        <td>${webLink}</td>
        <td>${l.category}</td>
        <td>${l.location}</td>
        <td>${l.rating}</td>
        <td><span class="badge ${pClass}">${l.priority}</span></td>
    `;
    tr.onclick = () => openDetail(l.lead_id, true);
    tbody.appendChild(tr);
}

// ── DATABASE & PIPELINE ──
async function loadDbLeads() {
    try {
        const r = await fetch('/api/leads');
        dbLeads = await r.json();
        renderDbTable();
        
        // Update Stats
        document.getElementById('dbTotal').innerText = dbLeads.length;
        document.getElementById('dbContacted').innerText = dbLeads.filter(l => ['contacted','answered','called'].includes(l.client_status)).length;
        document.getElementById('dbAccepted').innerText = dbLeads.filter(l => l.client_status === 'accepted').length;
        document.getElementById('dbRejected').innerText = dbLeads.filter(l => l.client_status === 'rejected').length;
        
    } catch(e) { toast('error', 'Failed to load database.'); }
}

function renderDbTable() {
    const tbody = document.getElementById('dbLeadsBody');
    if(!tbody) return;
    tbody.innerHTML = '';
    
    const filter = document.querySelector('.filter-chip[data-dbf].active').dataset.dbf;
    const search = document.getElementById('dbSearch').value.toLowerCase();
    const isAdmin = currentUser && currentUser.role === 'admin';
    
    // Show/hide checkbox and delete columns based on selectMode
    const checkboxHeader = document.getElementById('checkboxHeader');
    const deleteColHeader = document.getElementById('deleteColHeader');
    if(checkboxHeader) checkboxHeader.style.display = selectMode ? '' : 'none';
    if(deleteColHeader) deleteColHeader.style.display = (!selectMode && isAdmin) ? '' : 'none';
    
    const filtered = dbLeads.filter(l => {
        // Status filter
        if(filter !== 'all') {
            const st = l.client_status || 'new';
            if(filter === 'contacted' && !['contacted','answered','called'].includes(st)) return false;
            if(filter !== 'contacted' && st !== filter) return false;
        }
        // Search filter
        if(search) {
            const term = `${l.business_name} ${l.phone} ${l.agent}`.toLowerCase();
            if(!term.includes(search)) return false;
        }
        return true;
    });
    
    filtered.forEach(l => {
        const tr = document.createElement('tr');
        const st = l.client_status || 'new';
        let bClass = 'badge-new';
        if(st === 'accepted') bClass = 'badge-accepted';
        else if(st === 'rejected') bClass = 'badge-rejected';
        else if(['contacted','answered','called'].includes(st)) bClass = 'badge-contacted';
        else if(st === 'no_answer') bClass = 'badge-high';
        
        const webLink = l.website !== 'N/A' ? `<a href="${l.website}" target="_blank" class="td-link" onclick="event.stopPropagation()">Link</a>` : '—';
        const rating = l.rating !== 'N/A' ? l.rating : '—';
        
        // Checkbox cell (only in select mode)
        const checkboxCell = selectMode && isAdmin ? `<td onclick="event.stopPropagation()" style="width:40px;"><input type="checkbox" class="row-checkbox" data-id="${l.lead_id}" ${selectedLeadIds.has(l.lead_id) ? 'checked' : ''} style="width:16px; height:16px; cursor:pointer; accent-color:var(--danger);"></td>` : '';
        
        // Trash button cell (only for admin, when NOT in select mode)
        const trashCell = !selectMode && isAdmin ? `<td onclick="event.stopPropagation()" style="width:60px; text-align:center;"><button class="btn-icon btn-row-delete" data-id="${l.lead_id}" title="Delete Lead" style="color:var(--danger); padding:0.35rem;"><svg class="icon icon-sm"><use href="#i-trash"/></svg></button></td>` : '';
        
        // Row highlight if selected
        if(selectMode && selectedLeadIds.has(l.lead_id)) {
            tr.style.background = 'rgba(220,38,38,0.06)';
        }
        
        tr.innerHTML = `
            ${checkboxCell}
            <td class="td-main">${l.business_name}</td>
            <td>${l.phone}</td>
            <td>${webLink}</td>
            <td>${l.category}</td>
            <td><span class="badge ${bClass}">${st.replace('_',' ').toUpperCase()}</span></td>
            <td>${rating}</td>
            <td>${l.agent || 'System'}</td>
            ${trashCell}
        `;
        
        // Row click — open detail only when NOT in select mode
        tr.onclick = () => {
            if(selectMode && isAdmin) return; // handled by checkbox
            openDetail(l.lead_id, false);
        };
        
        tbody.appendChild(tr);
    });
    
    // Bind checkbox events
    if(selectMode && isAdmin) {
        tbody.querySelectorAll('.row-checkbox').forEach(cb => {
            cb.onchange = () => {
                if(cb.checked) selectedLeadIds.add(cb.dataset.id);
                else selectedLeadIds.delete(cb.dataset.id);
                updateDeleteSelectedBtn();
                // Update select-all checkbox state
                const total = tbody.querySelectorAll('.row-checkbox').length;
                const checked = tbody.querySelectorAll('.row-checkbox:checked').length;
                const selectAll = document.getElementById('selectAllCheckbox');
                if(selectAll) {
                    selectAll.indeterminate = checked > 0 && checked < total;
                    selectAll.checked = total > 0 && checked === total;
                }
            };
        });
        // Sync select-all checkbox state
        const total = tbody.querySelectorAll('.row-checkbox').length;
        const checked = tbody.querySelectorAll('.row-checkbox:checked').length;
        const selectAll = document.getElementById('selectAllCheckbox');
        if(selectAll) {
            selectAll.indeterminate = checked > 0 && checked < total;
            selectAll.checked = total > 0 && checked === total;
        }
    }
    
    // Bind per-row trash buttons
    if(!selectMode && isAdmin) {
        tbody.querySelectorAll('.btn-row-delete').forEach(btn => {
            btn.onclick = async (e) => {
                e.stopPropagation();
                const id = btn.dataset.id;
                const lead = dbLeads.find(l => l.lead_id === id);
                const name = lead ? lead.business_name : 'this lead';
                const ok = await showConfirm('Delete Lead', `Permanently delete "${name}"? This cannot be undone.`, 'Delete', 'danger');
                if(!ok) return;
                try {
                    await fetch(`/api/leads/${id}`, { method: 'DELETE' });
                    toast('success', `"${name}" deleted.`);
                    loadDbLeads();
                } catch(e) { toast('error', 'Failed to delete.'); }
            };
        });
    }
}

async function loadPipeline() {
    try {
        const r = await fetch('/api/leads/pipeline');
        const d = await r.json();
        
        document.getElementById('plNewCount').innerText = d.pipeline.new || 0;
        document.getElementById('plProgCount').innerText = (d.pipeline.contacted||0) + (d.pipeline.called||0) + (d.pipeline.answered||0);
        document.getElementById('plFollCount').innerText = (d.pipeline.followup||0) + (d.pipeline.no_answer||0);
        document.getElementById('plWonCount').innerText = d.pipeline.accepted || 0;
        
        // Simple client-side sorting for the columns based on dbLeads
        const colNew = document.getElementById('plNew');
        const colProg = document.getElementById('plProg');
        const colFoll = document.getElementById('plFoll');
        const colWon = document.getElementById('plWon');
        
        [colNew, colProg, colFoll, colWon].forEach(el => el.innerHTML = '');
        
        dbLeads.forEach(l => {
            const st = l.client_status || 'new';
            const card = document.createElement('div');
            card.className = 'card';
            card.style.cssText = 'padding:1rem; cursor:pointer; background:var(--bg2); border-left:3px solid transparent;';
            card.innerHTML = `<div style="font-weight:600; font-size:0.9rem; margin-bottom:0.25rem;">${l.business_name}</div>
                              <div style="font-size:0.75rem; color:var(--text3);">${l.phone}</div>`;
            card.onclick = () => openDetail(l.lead_id, false);
            
            if(st === 'new') { card.style.borderLeftColor = 'var(--text3)'; colNew.appendChild(card); }
            else if(['contacted','called','answered'].includes(st)) { card.style.borderLeftColor = 'var(--info)'; colProg.appendChild(card); }
            else if(['followup','no_answer'].includes(st)) { card.style.borderLeftColor = 'var(--purple)'; colFoll.appendChild(card); }
            else if(st === 'accepted') { card.style.borderLeftColor = 'var(--success)'; colWon.appendChild(card); }
        });
        
    } catch(e) {}
}

// ── Admin Delete Helpers ──
function updateDeleteSelectedBtn() {
    const btn = document.getElementById('deleteSelectedBtn');
    const countEl = document.getElementById('selectedCount');
    if(!btn) return;
    const n = selectedLeadIds.size;
    if(countEl) countEl.innerText = n;
    btn.innerHTML = `<svg class="icon icon-sm"><use href="#i-trash"/></svg> Delete Selected (${n})`;
    btn.disabled = n === 0;
    btn.style.opacity = n === 0 ? '0.5' : '1';
}

// ── FILTERS & MODALS ──
function initFiltersAndSearch() {
    document.querySelectorAll('.filter-chip[data-dbf]').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.filter-chip[data-dbf]').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderDbTable();
        };
    });
    
    document.getElementById('dbSearch').oninput = () => renderDbTable();
    
    document.getElementById('refreshBtn').onclick = () => {
        document.getElementById('refreshBtn').innerHTML = '<svg class="icon spin"><use href="#i-refresh"/></svg>';
        loadDbLeads().then(() => {
            setTimeout(() => {
                document.getElementById('refreshBtn').innerHTML = '<svg class="icon icon-sm"><use href="#i-refresh"/></svg> Refresh';
                toast('success', 'Database updated.');
            }, 500);
        });
    };
    
    // ── Admin: Select Mode Toggle ──
    const selectModeBtn = document.getElementById('selectModeBtn');
    const deleteSelectedBtn = document.getElementById('deleteSelectedBtn');
    const selectAllCheckbox = document.getElementById('selectAllCheckbox');
    
    if(selectModeBtn) {
        selectModeBtn.onclick = () => {
            selectMode = !selectMode;
            selectedLeadIds.clear();
            if(selectMode) {
                selectModeBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-x"/></svg> Cancel';
                selectModeBtn.style.background = 'var(--warn)';
                selectModeBtn.style.color = '#fff';
                selectModeBtn.style.borderColor = 'var(--warn)';
                deleteSelectedBtn.style.display = 'inline-flex';
                updateDeleteSelectedBtn();
            } else {
                selectModeBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-check-square"/></svg> Select';
                selectModeBtn.style.background = '';
                selectModeBtn.style.color = 'var(--warn)';
                selectModeBtn.style.borderColor = 'var(--warn)';
                deleteSelectedBtn.style.display = 'none';
            }
            renderDbTable();
        };
    }
    
    if(selectAllCheckbox) {
        selectAllCheckbox.onchange = () => {
            const tbody = document.getElementById('dbLeadsBody');
            if(!tbody) return;
            tbody.querySelectorAll('.row-checkbox').forEach(cb => {
                cb.checked = selectAllCheckbox.checked;
                if(selectAllCheckbox.checked) selectedLeadIds.add(cb.dataset.id);
                else selectedLeadIds.delete(cb.dataset.id);
                // Highlight rows
                const row = cb.closest('tr');
                if(row) row.style.background = selectAllCheckbox.checked ? 'rgba(220,38,38,0.06)' : '';
            });
            updateDeleteSelectedBtn();
        };
    }
    
    if(deleteSelectedBtn) {
        deleteSelectedBtn.onclick = async () => {
            if(selectedLeadIds.size === 0) { toast('error', 'No leads selected.'); return; }
            const ok = await showConfirm(
                'Delete Selected Leads',
                `Permanently delete ${selectedLeadIds.size} selected lead(s)? This cannot be undone.`,
                `Delete ${selectedLeadIds.size} Leads`,
                'danger'
            );
            if(!ok) return;
            
            deleteSelectedBtn.disabled = true;
            deleteSelectedBtn.innerHTML = '<svg class="icon spin icon-sm"><use href="#i-refresh"/></svg> Deleting...';
            
            let successCount = 0;
            for(const id of selectedLeadIds) {
                try {
                    const r = await fetch(`/api/leads/${id}`, { method: 'DELETE' });
                    if(r.ok) successCount++;
                } catch(e) {}
            }
            
            selectedLeadIds.clear();
            selectMode = false;
            selectModeBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-check-square"/></svg> Select';
            selectModeBtn.style.background = '';
            selectModeBtn.style.color = 'var(--warn)';
            selectModeBtn.style.borderColor = 'var(--warn)';
            deleteSelectedBtn.style.display = 'none';
            deleteSelectedBtn.disabled = false;
            deleteSelectedBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-trash"/></svg> Delete Selected (<span id="selectedCount">0</span>)';
            
            toast('success', `${successCount} lead(s) deleted successfully.`);
            loadDbLeads();
        };
    }
}

function initModals() {
    document.getElementById('importBtn').onclick = () => {
        document.getElementById('addLeadModal').classList.add('open');
    };
    
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el => {
        el.onclick = (e) => {
            if(e.target === el || el.classList.contains('modal-close')) {
                document.querySelectorAll('.modal-overlay').forEach(m => m.classList.remove('open'));
            }
        };
    });
    
    document.getElementById('addLeadForm').onsubmit = async (e) => {
        e.preventDefault();
        const data = {
            business_name: document.getElementById('mName').value,
            phone: document.getElementById('mPhone').value || 'N/A',
            website: document.getElementById('mWeb').value || 'N/A',
            category: document.getElementById('mCat').value,
            location: document.getElementById('mLoc').value,
            agent: currentUser.name
        };
        
        try {
            const r = await fetch('/api/leads/add', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
            if(r.ok) {
                toast('success', 'Lead added successfully.');
                document.getElementById('addLeadModal').classList.remove('open');
                e.target.reset();
                loadDbLeads();
            }
        } catch(err) { toast('error', 'Failed to add lead.'); }
    };

    const addEmpBtn = document.getElementById('addEmpBtn');
    if(addEmpBtn) {
        addEmpBtn.onclick = () => document.getElementById('addEmpModal').classList.add('open');
    }
    
    const empForm = document.getElementById('addEmpForm');
    if(empForm) {
        empForm.onsubmit = async (e) => {
            e.preventDefault();
            const data = {
                name: document.getElementById('eName').value,
                id: document.getElementById('eId').value,
                pass: document.getElementById('ePass').value,
                role: document.getElementById('eRole').value
            };
            try {
                const r = await fetch('/api/admin/users', {method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify(data)});
                if(r.ok) {
                    toast('success', 'Employee created successfully.');
                    document.getElementById('addEmpModal').classList.remove('open');
                    e.target.reset();
                    loadAdminStats(); // refresh table
                }
            } catch(err) { toast('error', 'Failed to add employee.'); }
        };
    }
}

// ── DETAIL PANEL ──
async function openDetail(id, isScraper) {
    openLeadId = id;
    let l = isScraper ? allLeads.find(x => x.lead_id === id) : dbLeads.find(x => x.lead_id === id);
    
    if(!l && !isScraper) {
        const r = await fetch(`/api/leads/${id}`);
        l = await r.json();
    }
    if(!l) return;
    
    // ── LEAD CLAIM LOGIC ──
    try {
        const cr = await fetch(`/api/leads/${id}/claim`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ agent_id: currentUser.id, agent_name: currentUser.name })
        });
        const cd = await cr.json();
        if(!cr.ok && cd.conflict) {
            showConfirm(
                'Lead Already Claimed',
                `This client is currently being handled by ${cd.claimed_by_name}. Please try another lead.`,
                'Okay',
                'primary'
            );
            return;
        }
    } catch(e) { console.error("Claim error", e); }

    document.getElementById('dName').innerText = l.business_name;
    document.getElementById('dCat').innerText = l.category;
    document.getElementById('dLoc').innerText = l.location;
    document.getElementById('dPhone').innerText = l.phone;
    document.getElementById('dEmail').innerText = l.email || 'N/A';
    document.getElementById('dRate').innerText = `${l.rating !== 'N/A' ? l.rating : 'N/A'} ${l.reviews !== 'N/A' && l.reviews !== '0' ? '('+l.reviews+')' : ''}`;
    
    const webHtml = l.website !== 'N/A' ? `<a href="${l.website}" target="_blank" class="td-link">${l.website}</a>` : 'No Website';
    document.getElementById('dWeb').innerHTML = webHtml;
    
    document.getElementById('dNotes').value = l.notes || '';
    
    // Set active button
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.classList.remove('active');
        if(btn.dataset.action === (l.client_status || 'new')) btn.classList.add('active');
    });
    
    // Timeline
    const tDiv = document.getElementById('dTimeline');
    if(l.action_history && l.action_history.length > 0) {
        tDiv.innerHTML = [...l.action_history].reverse().map(a => `
            <div class="timeline-item">
                <div class="timeline-dot dot-${a.type}"></div>
                <div class="timeline-content">
                    <div class="timeline-title">${a.type.toUpperCase()}</div>
                    <div class="timeline-meta">by ${a.agent} • ${new Date(a.timestamp).toLocaleString()}</div>
                    ${a.note ? `<div class="timeline-note">${a.note}</div>` : ''}
                </div>
            </div>
        `).join('');
    } else {
        tDiv.innerHTML = '<p style="color:var(--text3); font-size:0.85rem;">No interaction history yet.</p>';
    }
    
    // AI Audit
    const aiBox = document.getElementById('dAiSum');
    aiBox.innerHTML = '<svg class="icon spin icon-sm"><use href="#i-refresh"/></svg> Analyzing lead...';
    try {
        const ar = await fetch('/api/ai/analyze', {method: 'POST', headers: {'Content-Type':'application/json'}, body: JSON.stringify(l)});
        const data = await ar.json();
        
        let html = `<div style="margin-bottom:1rem;">${data.summary}</div>`;
        if(data.issues && data.issues.length) {
            html += `<ul class="ai-list" style="color:var(--danger);">${data.issues.map(i=>`<li>${i}</li>`).join('')}</ul>`;
        }
        if(data.upgrades && data.upgrades.length) {
            html += `<ul class="ai-list" style="color:var(--success); margin-top:1rem;">${data.upgrades.map(u=>`<li>${u}</li>`).join('')}</ul>`;
        }
        if(data.pitch) {
            html += `<div class="ai-pitch"><strong>Suggested Pitch:</strong> "${data.pitch}"</div>`;
        }
        aiBox.innerHTML = html;
    } catch(e) { aiBox.innerHTML = 'AI Audit unavailable.'; }
    
    document.getElementById('detailOverlay').classList.add('open');
}

function initDetail() {
    document.getElementById('closeDetail').onclick = async () => {
        document.getElementById('detailOverlay').classList.remove('open');
        if(openLeadId) {
            // Release claim
            try {
                await fetch(`/api/leads/${openLeadId}/claim`, {
                    method: 'DELETE',
                    headers: {'Content-Type': 'application/json'},
                    body: JSON.stringify({ agent_id: currentUser.id })
                });
            } catch(e) {}
            openLeadId = null;
        }
    };
    
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.onclick = async () => {
            if(!openLeadId) return;
            const action = btn.dataset.action;
            
            // Optimistic UI update
            document.querySelectorAll('.action-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            
            const noteVal = document.getElementById('dNotes').value;
            
            try {
                const r = await fetch(`/api/leads/${openLeadId}/action`, {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({ type: action, agent: currentUser.name, note: noteVal })
                });
                if(r.ok) {
                    toast('success', `Lead marked as ${action.toUpperCase()}`);
                    // Re-open detail to refresh timeline
                    openDetail(openLeadId, false);
                    loadDbLeads();
                }
            } catch(e) { toast('error', 'Failed to save action'); }
        };
    });
    
    document.getElementById('saveNotesBtn').onclick = async () => {
        if(!openLeadId) return;
        try {
            await fetch(`/api/leads/${openLeadId}/notes`, {
                method: 'POST', headers: {'Content-Type':'application/json'},
                body: JSON.stringify({ notes: document.getElementById('dNotes').value })
            });
            toast('success', 'Notes saved.');
        } catch(e) { toast('error', 'Failed to save notes.'); }
    };
    
    document.getElementById('btnDeleteLead').onclick = async () => {
        if(!openLeadId) return;
        const ok = await showConfirm('Delete Lead', 'Are you sure you want to permanently delete this lead? This cannot be undone.', 'Delete', 'danger');
        if(!ok) return;
        try {
            await fetch(`/api/leads/${openLeadId}`, { method: 'DELETE' });
            toast('success', 'Lead deleted.');
            document.getElementById('detailOverlay').classList.remove('open');
            loadDbLeads();
        } catch(e) { toast('error', 'Failed to delete.'); }
    };
}

// ── TEAMS CONVERSATION ──
function initChat() {
    document.querySelectorAll('.channel-item').forEach(el => {
        el.onclick = () => {
            document.querySelectorAll('.channel-item').forEach(i => i.classList.remove('active'));
            el.classList.add('active');
            activeChannel = el.dataset.chan;
            
            // Update Title
            const titles = { 'general': ['#', 'General Team', 'Company-wide discussion'], 'ira_ai': ['AI', 'Ira AI Assistant', 'Your intelligent CRM companion'] };
            const t = titles[activeChannel] || [activeChannel.charAt(0).toUpperCase(), activeChannel, 'Direct Message'];
            
            const av = document.getElementById('cAvatar');
            av.innerText = t[0];
            av.style.background = activeChannel === 'ira_ai' ? 'var(--purple)' : 'var(--accent)';
            
            document.getElementById('cTitle').innerText = t[1];
            document.getElementById('cDesc').innerText = t[2];
            document.getElementById('chatInput').placeholder = `Message ${t[1]}...`;
            
            fetchMessages();
        };
    });
    
    const input = document.getElementById('chatInput');
    input.onkeypress = (e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMsg(); } };
    document.getElementById('sendChatBtn').onclick = sendMsg;
}

async function startChatSync() {
    if(chatInterval) clearInterval(chatInterval);
    // Populate DM list
    try {
        const ur = await fetch('/api/admin/users');
        const users = await ur.json();
        const dmHtml = users.filter(u => u.id !== currentUser.id).map(u => `
            <div class="channel-item" data-chan="${u.name}">
                <div style="width:8px;height:8px;border-radius:50%;background:var(--success);margin-right:4px;"></div> ${u.name}
            </div>
        `).join('');
        document.getElementById('dmList').innerHTML = dmHtml;
        initChat(); // Re-bind clicks
    } catch(e){}
    
    fetchMessages();
    chatInterval = setInterval(fetchMessages, 2000);
}

async function fetchMessages() {
    try {
        const r = await fetch(`/api/messages?channel=${encodeURIComponent(activeChannel)}`);
        const msgs = await r.json();
        if(msgs.length !== lastMsgCount) {
            renderMessages(msgs);
            lastMsgCount = msgs.length;
            if(activeTab !== 'chat') {
                const b = document.getElementById('chatBadge');
                b.style.display = 'inline-block';
            }
        }
    } catch(e) {}
}

function renderMessages(msgs) {
    const body = document.getElementById('chatBody');
    const isAtBottom = body.scrollHeight - body.scrollTop <= body.clientHeight + 50;
    
    if(msgs.length === 0) {
        body.innerHTML = `<div style="text-align:center; padding:2rem; color:var(--text3);">No messages yet. Say hello!</div>`;
        return;
    }
    
    let html = '';
    let lastDateStr = '';
    
    msgs.forEach(m => {
        const msgDateObj = new Date(m.timestamp);
        const msgDateStr = msgDateObj.toLocaleDateString('en-GB').replace(/\//g, '-'); // e.g., 01-02-2025
        
        if(msgDateStr !== lastDateStr) {
            html += `<div class="chat-date-separator"><span>${msgDateStr}</span></div>`;
            lastDateStr = msgDateStr;
        }
        
        const isSelf = m.user_id === currentUser.id;
        const isIra = m.is_ai || m.user_id === 'ira_ai';
        const avTxt = isIra ? 'IA' : (m.user_name || '?').substring(0,2).toUpperCase();
        
        let cls = 'message';
        if(isSelf) cls += ' self';
        if(isIra) cls += ' ira';
        
        html += `
            <div class="${cls}">
                <div class="msg-avatar">${avTxt}</div>
                <div class="msg-content">
                    <div class="msg-meta">
                        <span class="msg-author">${m.user_name}</span>
                        <span class="msg-time">${msgDateObj.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div class="msg-bubble">${formatMsg(m.text)}</div>
                </div>
            </div>
        `;
    });
    
    body.innerHTML = html;
    if(isAtBottom) scrollToBottomChat();
}

function formatMsg(txt) {
    return txt.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
              .replace(/\n/g, '<br>')
              .replace(/@ira/gi, '<strong style="color:var(--purple);">@ira</strong>');
}

async function sendMsg() {
    const input = document.getElementById('chatInput');
    const text = input.value.trim();
    if(!text || !currentUser) return;
    
    try {
        const r = await fetch('/api/messages?channel='+encodeURIComponent(activeChannel), {
            method: 'POST', headers: {'Content-Type':'application/json'},
            body: JSON.stringify({ user_id: currentUser.id, user_name: currentUser.name, text: text })
        });
        if(r.ok) {
            input.value = '';
            fetchMessages();
        }
    } catch(e) { toast('error', 'Failed to send message.'); }
}

function scrollToBottomChat() {
    const body = document.getElementById('chatBody');
    if(body) body.scrollTop = body.scrollHeight;
}

// ── ADMIN & TASKS ──
function loadTasks() {
    const btn = document.getElementById('aiScheduleBtn');
    btn.onclick = () => {
        btn.innerHTML = '<svg class="icon spin icon-sm"><use href="#i-refresh"/></svg> Building...';
        setTimeout(() => {
            btn.innerHTML = '<svg class="icon icon-sm"><use href="#i-ai"/></svg> AI Generate Plan';
            
            const hot = dbLeads.filter(l => l.priority && l.priority.includes('HIGH')).slice(0,3);
            const noAns = dbLeads.filter(l => l.client_status === 'no_answer').slice(0,3);
            
            let html = '';
            if(hot.length) {
                html += `<div style="font-weight:600; font-size:0.8rem; text-transform:uppercase; color:var(--text3); margin-top:1rem;">Priority Actions</div>`;
                hot.forEach(l => html += taskCardHtml(l, 'hot'));
            }
            if(noAns.length) {
                html += `<div style="font-weight:600; font-size:0.8rem; text-transform:uppercase; color:var(--text3); margin-top:1rem;">Follow-ups</div>`;
                noAns.forEach(l => html += taskCardHtml(l, 'follow'));
            }
            
            document.getElementById('myTasksList').innerHTML = html || '<p>No pending tasks! Good job.</p>';
        }, 1200);
    };
    
    // Performance update
    const contacted = dbLeads.filter(l => ['contacted','answered','called','accepted','rejected'].includes(l.client_status)).length;
    const accepted = dbLeads.filter(l => l.client_status === 'accepted').length;
    
    document.getElementById('mpContacted').innerText = contacted;
    document.getElementById('mpBar1').style.width = Math.min((contacted/50)*100, 100) + '%';
    
    const rate = contacted > 0 ? Math.round((accepted/contacted)*100) : 0;
    document.getElementById('mpConv').innerText = rate;
    document.getElementById('mpBar2').style.width = rate + '%';
}

function taskCardHtml(l, type) {
    const icon = type === 'hot' ? '<svg class="icon icon-sm" style="color:var(--warn)"><use href="#i-flame"/></svg>' : '<svg class="icon icon-sm" style="color:var(--info)"><use href="#i-phone"/></svg>';
    return `
        <div class="card" style="padding:1rem; border-left: 3px solid ${type==='hot'?'var(--warn)':'var(--info)'}; display:flex; justify-content:space-between; align-items:center; cursor:pointer" onclick="openDetail('${l.lead_id}', false)">
            <div>
                <div style="font-weight:600; font-size:0.9rem; display:flex; align-items:center; gap:0.4rem;">${icon} Call ${l.business_name}</div>
                <div style="font-size:0.8rem; color:var(--text3); margin-top:0.2rem;">${l.phone}</div>
            </div>
            <button class="btn btn-secondary btn-sm">View</button>
        </div>
    `;
}

async function loadAdminStats() {
    try {
        const r = await fetch('/api/admin/stats');
        const d = await r.json();
        
        document.getElementById('adLeads').innerText = d.total;
        document.getElementById('adConv').innerText = d.conversion_rate + '%';
        
        // Load employees
        const ur = await fetch('/api/admin/users');
        const users = await ur.json();
        
        document.getElementById('adAgents').innerText = users.length || 1;
        
        const tbody = document.getElementById('agentPerfBody');
        tbody.innerHTML = users.map(u => {
            return `<tr>
                <td class="td-main">${u.name}</td>
                <td>${u.id}</td>
                <td><span style="font-family:monospace; background:var(--bg3); padding:0.2rem 0.4rem; border-radius:4px">${u.pass}</span></td>
                <td style="text-transform:capitalize">${u.role}</td>
                <td>
                    ${u.role === 'admin' ? '' : `<button class="btn btn-ghost btn-sm" style="color:var(--danger); padding:0.2rem;" onclick="deleteUser('${u.id}')">Remove</button>`}
                </td>
            </tr>`;
        }).join('');
        
        // Load logs
        const lr = await fetch('/api/admin/logs');
        const logs = await lr.json();
        const logBox = document.getElementById('activityLog');
        logBox.innerHTML = logs.map(log => `
            <div style="padding:0.75rem; background:var(--bg3); border-radius:var(--r-sm); font-size:0.8rem; display:flex; justify-content:space-between;">
                <div><strong style="color:var(--text)">${log.agent}</strong> marked <strong style="color:var(--accent)">${log.business}</strong> as ${log.type.toUpperCase()}</div>
                <div style="color:var(--text3); font-size:0.7rem;">${new Date(log.timestamp).toLocaleTimeString()}</div>
            </div>
        `).join('');
        
    } catch(e) {}
}

async function deleteUser(userId) {
    const ok = await showConfirm('Remove Employee', 'Remove this employee from the system? They will no longer be able to log in.', 'Remove', 'danger');
    if(!ok) return;
    try {
        await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
        toast('success', 'Employee removed.');
        loadAdminStats();
    } catch(e) { toast('error', 'Failed to remove employee.'); }
}

// ── CUSTOM CONFIRM MODAL ──
function showConfirm(title, message, confirmLabel = 'Confirm', variant = 'primary') {
    return new Promise(resolve => {
        const modal = document.getElementById('confirmModal');
        document.getElementById('confirmTitle').innerText = title;
        document.getElementById('confirmMsg').innerText = message;
        const btn = document.getElementById('confirmOkBtn');
        btn.innerText = confirmLabel;
        btn.className = `btn btn-${variant === 'danger' ? 'danger' : 'primary'}`;
        modal.classList.add('open');

        const cleanup = (result) => {
            modal.classList.remove('open');
            btn.replaceWith(btn.cloneNode(true));
            document.getElementById('confirmCancelBtn').replaceWith(document.getElementById('confirmCancelBtn').cloneNode(true));
            resolve(result);
        };

        document.getElementById('confirmOkBtn').onclick = () => cleanup(true);
        document.getElementById('confirmCancelBtn').onclick = () => cleanup(false);
        modal.onclick = (e) => { if(e.target === modal) cleanup(false); };
    });
}

function toast(type, msg) {
    const cont = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icon = type === 'success' ? 'i-check' : (type === 'error' ? 'i-x' : 'i-bell');
    t.innerHTML = `<svg class="icon"><use href="#${icon}"/></svg> <span>${msg}</span>`;
    cont.appendChild(t);
    setTimeout(() => {
        t.style.animation = 'fadeUp 0.3s ease reverse forwards';
        setTimeout(() => t.remove(), 300);
    }, 4000);
}
