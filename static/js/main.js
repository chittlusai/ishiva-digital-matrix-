// Lead Matrix Pro v5.2 - Teams Workspace Edition
let allLeads=[], activeFilters=new Set(['all']), currentUser=null, openLeadId=null, dbLeads=[];
let chatInterval=null, lastMsgCount=0;

document.addEventListener('DOMContentLoaded',()=>{
    initAuth(); initLogout(); initNav(); initWizard(); initModals(); initScraper(); initFilters(); initDetail(); initChat();
});

// ── AUTH ──
function initAuth(){
    document.getElementById('loginForm').onsubmit=async e=>{
        e.preventDefault();
        const r=await fetch('/api/auth',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:document.getElementById('authId').value,pass:document.getElementById('authPass').value})});
        const d=await r.json();
        if(d.ok){
            currentUser=d.user;
            document.getElementById('loginWrapper').style.display='none';
            const app=document.getElementById('app'); app.style.opacity='1'; app.style.pointerEvents='auto';
            document.getElementById('uName').innerText=currentUser.name;
            document.getElementById('uRole').innerText=currentUser.role;
            document.getElementById('uAvatar').innerText=currentUser.name.charAt(0);
            document.querySelectorAll('.admin-only').forEach(el=>el.style.display=currentUser.role==='admin'?'':'none');
            
            // Show Chat Toggle only after login
            document.getElementById('toggleChat').classList.add('show');
            
            toast(`Welcome, ${currentUser.name}`);
            startChatSync();
        } else {
            const err=document.getElementById('loginError'); err.style.display='block'; setTimeout(()=>err.style.display='none',2500);
        }
    };
}

function initLogout(){
    document.getElementById('logoutBtn').onclick=()=>{
        currentUser=null; clearInterval(chatInterval);
        document.getElementById('loginWrapper').style.display='flex';
        document.getElementById('app').style.opacity='0'; document.getElementById('app').style.pointerEvents='none';
        document.getElementById('toggleChat').classList.remove('show');
    };
}

// ── NAVIGATION & REFRESH ──
function initNav(){
    document.querySelectorAll('.nav-tab').forEach(tab=>{
        tab.onclick=()=>{
            document.querySelectorAll('.nav-tab').forEach(t=>t.classList.remove('active'));
            tab.classList.add('active');
            const target=tab.dataset.tab;
            document.querySelectorAll('.tab-panel').forEach(p=>p.classList.remove('active'));
            document.getElementById('panel-'+target).classList.add('active');
            document.getElementById('wizardWrap').style.display=target==='scraper'?'':'none';
            if(target==='leads') loadDbLeads();
            if(target==='tasks') loadMyTasks();
            if(target==='admin') loadAdminData();
        };
    });
    const refreshBtn = document.getElementById('refreshLeadsBtn');
    if(refreshBtn) refreshBtn.onclick=()=>loadDbLeads();
    
    const aiTaskBtn = document.getElementById('generateAITasksBtn');
    if(aiTaskBtn) aiTaskBtn.onclick=async()=>{
        aiTaskBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-ai"/></svg> Analyzing Leads...';
        aiTaskBtn.disabled = true;
        setTimeout(()=>{
            generateAITasks();
            aiTaskBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-check"/></svg> Schedule Generated';
            setTimeout(()=> { aiTaskBtn.innerHTML = '<svg class="icon icon-sm"><use href="#i-ai"/></svg> AI Generate Schedule'; aiTaskBtn.disabled=false; }, 3000);
        }, 1500);
    };
}

function getStatusBadgeClass(sc) {
    if(!sc) return 'badge-new';
    const map = {
        'new': 'badge-new',
        'contacted': 'badge-contacted',
        'called': 'badge-contacted',
        'answered': 'badge-accepted',
        'accepted': 'badge-accepted',
        'rejected': 'badge-danger',
        'no_answer': 'badge-high',
        'followup': 'badge-med'
    };
    return map[sc.toLowerCase()] || 'badge-new';
}

// ── TEAMS WORKSPACE LOGIC ──
function initChat() {
    const chatIn = document.getElementById('chatInput');
    if(!chatIn) return;

    chatIn.addEventListener('input', function() {
        this.style.height = 'auto';
        this.style.height = (this.scrollHeight) + 'px';
    });

    chatIn.onkeypress = (e) => { 
        if(e.key === 'Enter' && !e.shiftKey) { 
            e.preventDefault(); 
            sendChatMessage(); 
        } 
    };

    document.getElementById('sendChat').onclick = sendChatMessage;
    document.getElementById('toggleChat').onclick = () => {
        document.getElementById('chatSidebar').classList.add('active');
        chatIn.focus();
    };
    document.getElementById('closeChat').onclick = () => document.getElementById('chatSidebar').classList.remove('active');
}

async function startChatSync(){
    if(chatInterval) clearInterval(chatInterval);
    chatInterval=setInterval(async()=>{
        try {
            const r=await fetch('/api/messages');
            const msgs=await r.json();
            if(msgs.length !== lastMsgCount){
                renderChat(msgs);
                lastMsgCount = msgs.length;
            }
        } catch(e){}
    }, 2000);
}

function renderChat(messages){
    const body=document.getElementById('chatBody');
    const isAtBottom=body.scrollHeight - body.scrollTop <= body.clientHeight + 150;
    
    body.innerHTML=messages.map(m=>{
        const isSent = m.user_id === currentUser.id;
        const name = m.user_name || 'User';
        const avatar = m.is_ai ? 'IA' : name.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2);
        return `
            <div class="chat-msg-row ${isSent?'sent':'received'}">
                <div class="msg-bubble">
                    <div class="msg-meta">
                        <span class="u" style="color:${isSent?'#fff':'#6264a7'}">${name}</span>
                        <span class="t">${new Date(m.timestamp).toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})}</span>
                    </div>
                    <div class="msg-text">${m.text}</div>
                </div>
            </div>
        `;
    }).join('');
    
    if(isAtBottom) body.scrollTop=body.scrollHeight;
}

async function sendChatMessage(){
    const input=document.getElementById('chatInput');
    const text=input.value.trim();
    if(!text || !currentUser) return;
    try {
        const res = await fetch('/api/messages',{
            method:'POST',
            headers:{'Content-Type':'application/json'},
            body:JSON.stringify({user_id:currentUser.id, user_name:currentUser.name, text: text})
        });
        if(res.ok) {
            input.value=''; input.style.height='auto';
            // Trigger local refresh immediately
            const r2=await fetch('/api/messages');
            const msgs=await r2.json();
            renderChat(msgs);
        }
    } catch(e){ toast("Failed to send message"); }
}

// ── SCRAPER ──
function initScraper(){
    const form=document.getElementById('scrapeForm'), btn=document.getElementById('searchBtn'), tbody=document.getElementById('leadsBody'), pArea=document.getElementById('progressArea'), pBar=document.getElementById('progressBar'), cEl=document.getElementById('curCount'), lEl=document.getElementById('limTotal'), pdf=document.getElementById('pdfBtn');
    form.onsubmit=e=>{
        e.preventDefault(); allLeads=[]; tbody.innerHTML=''; btn.disabled=true;
        btn.innerHTML='Extracting…';
        const p=new URLSearchParams({location:document.getElementById('location').value,category:document.getElementById('category').value,country:document.getElementById('country').value,limit:document.getElementById('limit').value,agent:currentUser.name});
        const lim=parseInt(p.get('limit')); lEl.innerText=lim; pArea.style.visibility='visible'; pBar.style.width='0%';
        const es=new EventSource(`/api/scrape_stream?${p}`);
        es.onmessage=ev=>{
            const d=JSON.parse(ev.data);
            if(d.done){ es.close(); btn.disabled=false; btn.innerHTML='Extract'; pdf.disabled=false; toast(`Scraped ${allLeads.length} leads`); return; }
            allLeads.push(d); addRow(d, tbody); pBar.style.width=`${(allLeads.length/lim)*100}%`; cEl.innerText=allLeads.length;
        };
        es.onerror=()=>{ es.close(); btn.disabled=false; };
    };
}

function addRow(l, tbody){
    const tr=document.createElement('tr');
    const pc=l.priority&&l.priority.includes('HIGH')?'badge-high':'badge-med';
    const sc=l.client_status||'new';
    const scClass=getStatusBadgeClass(sc);
    const webLink = l.website!=='N/A' ? `<a href="${l.website}" target="_blank" style="color:#6264a7;text-decoration:underline" onclick="event.stopPropagation()">Visit Site</a>` : '—';
    tr.innerHTML=`<td>${l.business_name}</td><td>${l.phone}</td><td>${webLink}</td><td>${l.email||'—'}</td><td>${l.category}</td><td>${l.location}</td><td>${l.rating}</td><td>${l.reviews}</td><td><span class="badge ${pc}">${l.priority}</span></td><td><span class="badge ${scClass}">${sc.replace('_',' ').toUpperCase()}</span></td><td>${l.date_scraped}</td>`;
    tr.onclick=()=>openDetail(l.lead_id);
    tbody.appendChild(tr);
}

// ── DETAIL ──
function initDetail(){
    document.getElementById('closeDetail').onclick=()=>document.getElementById('detailOverlay').classList.remove('open');
    document.getElementById('detailOverlay').onclick=e=>{
        if(e.target===document.getElementById('detailOverlay')) document.getElementById('detailOverlay').classList.remove('open');
    };
    
    const doneBtn = document.getElementById('btnDoneDetail');
    if(doneBtn) doneBtn.onclick=async()=>{
        const txt=document.getElementById('dNotes').value;
        if(openLeadId) await fetch(`/api/leads/${openLeadId}/notes`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({notes:txt})});
        document.getElementById('detailOverlay').classList.remove('open');
    };
    document.querySelectorAll('.action-btn').forEach(b=>{
        b.onclick=()=>{
            if(!openLeadId) return;
            const action = b.dataset.action;
            
            // ── OPTIMISTIC UI: Update instantly with zero lag ──
            document.querySelectorAll('.action-btn').forEach(btn=>btn.classList.remove('active'));
            b.classList.add('active');
            
            const dNotes = document.getElementById('dNotes');
            const timeStr = new Date().toLocaleTimeString();
            const noteLine = `[Auto] Marked as ${action.toUpperCase()} at ${timeStr}`;
            dNotes.value += (dNotes.value ? '\n' : '') + noteLine;
            
            const l1 = allLeads.find(x=>x.lead_id===openLeadId);
            if(l1) l1.client_status = action;
            
            const tbody=document.getElementById('leadsBody');
            if(tbody) { tbody.innerHTML=''; allLeads.forEach(ld=>addRow(ld, tbody)); applyFilter(); }
            
            // Instantly prepend to timeline
            const th = document.getElementById('dTimeline');
            const newHistoryHTML = `<div style="font-size:.8rem;margin-bottom:.5rem;padding-left:.8rem;border-left:2px solid #6264a7"><strong style="color:#fff">${action.toUpperCase()}</strong> by ${currentUser?currentUser.name:'Agent'}<br><span style="color:var(--text3);font-size:.7rem">${new Date().toLocaleString()}</span></div>`;
            th.insertAdjacentHTML('afterbegin', newHistoryHTML);
            if(th.innerHTML.includes('No activity yet')) th.innerHTML = newHistoryHTML;
            
            // ── BACKGROUND SERVER UPDATE ──
            fetch(`/api/leads/${openLeadId}/action`, {
                method:'POST',
                headers:{'Content-Type':'application/json'},
                body:JSON.stringify({type:action, agent:currentUser?currentUser.name:'Agent'})
            }).then(res => {
                if(res.ok) {
                    toast('Action logged');
                    loadDbLeads(); // refresh the background leads grid safely
                } else {
                    toast('Failed to save action');
                }
            }).catch(() => toast('Network error'));
        };
    });
}

window.toggleTask = async function(id, step, done, el){
    await fetch(`/api/leads/${id}/task`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({step,done})});
    const span = el.nextElementSibling;
    span.style.textDecoration = done ? 'line-through' : 'none';
    span.style.color = done ? 'var(--text3)' : 'inherit';
    loadDbLeads();
};

async function openDetail(id){
    openLeadId=id;
    // Attempt to load from DB first, then allLeads
    let l = dbLeads.find(x=>x.lead_id===id) || allLeads.find(x=>x.lead_id===id);
    if(!l) {
        const r=await fetch(`/api/leads/${id}`);
        l=await r.json();
    }
    
    document.getElementById('dName').innerText=l.business_name;
    document.getElementById('dSub').innerText=`${l.category} • ${l.location}`;
    document.getElementById('dPhone').innerText=l.phone;
    document.getElementById('dEmail').innerText=l.email||'N/A';
    document.getElementById('dWebsite').innerHTML=l.website!=='N/A'?`<a href="${l.website}" target="_blank" style="color:#6264a7;text-decoration:underline">Visit Site</a>`:'No Website';
    document.getElementById('dRating').innerText=`${l.rating} (${l.reviews} reviews)`;
    document.getElementById('dNotes').value=l.notes||'';
    
    document.querySelectorAll('.action-btn').forEach(b=>{
        b.classList.remove('active');
        if(b.dataset.action === (l.client_status||'new')) b.classList.add('active');
    });
    
    const aiBox=document.getElementById('aiAnalysis');
    aiBox.innerHTML='Auditing…';
    try {
        const aiRes=await fetch('/api/ai/analyze',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(l)});
        const aiData=await aiRes.json();
        aiBox.innerHTML=`
            <div class="ai-summary">${aiData.summary}</div>
            <div style="font-size:.7rem; font-weight:700; color:var(--text3); margin: .8rem 0 .4rem;">ISSUES FOUND</div>
            <ul class="ai-list" style="color:var(--danger)">${aiData.issues.map(i=>`<li>${i}</li>`).join('')}</ul>
            <div style="font-size:.7rem; font-weight:700; color:var(--text3); margin: .8rem 0 .4rem;">SUGGESTED UPGRADES</div>
            <ul class="ai-list" style="color:#6264a7">${aiData.upgrades.map(u=>`<li>${u}</li>`).join('')}</ul>
        `;
    } catch(e){ aiBox.innerHTML='Audit Failed'; }



    const th = document.getElementById('dTimeline');
    if(l.action_history && l.action_history.length > 0) {
        th.innerHTML = l.action_history.map(a=>`<div style="font-size:.8rem;margin-bottom:.5rem;padding-left:.8rem;border-left:2px solid #6264a7"><strong style="color:#fff">${a.type.toUpperCase()}</strong> by ${a.agent}<br><span style="color:var(--text3);font-size:.7rem">${new Date(a.timestamp).toLocaleString()}</span></div>`).join('');
    } else {
        th.innerHTML = '<div style="font-size:.8rem;color:var(--text3)">No activity yet.</div>';
    }

    document.getElementById('detailOverlay').classList.add('open');
}

async function loadDbLeads(){
    const r=await fetch('/api/leads'); dbLeads=await r.json();
    const tbody=document.getElementById('dbLeadsBody'); tbody.innerHTML='';
    dbLeads.forEach(l=>{
        const tr=document.createElement('tr');
        const sc=l.client_status||'new';
        const scClass=getStatusBadgeClass(sc);
        tr.innerHTML=`<td>${l.business_name}</td><td>${l.phone}</td><td>${l.agent||'—'}</td><td><span class="badge ${scClass}">${sc.replace('_',' ').toUpperCase()}</span></td><td>—</td><td>—</td>`;
        tr.onclick=()=>openDetail(l.lead_id);
        tbody.appendChild(tr);
    });
    document.getElementById('dbTotal').innerText=dbLeads.length;
}

function toast(m){const t=document.getElementById('toast'); t.innerText=m; t.style.display='block'; setTimeout(()=>t.style.display='none',3000);}

// ── WIZARD ──
function initWizard(){
    document.querySelectorAll('.next-btn').forEach(b=>{
        b.onclick=()=>{
            const step=b.closest('.wizard-step');
            const hi=step.querySelector('input[type="hidden"]');
            if(hi&&!hi.value){toast('Make a selection');return;}
            step.classList.remove('active');
            document.getElementById(b.dataset.next).classList.add('active');
        };
    });
    document.querySelectorAll('.back-btn').forEach(b=>b.onclick=()=>{b.closest('.wizard-step').classList.remove('active');document.getElementById(b.dataset.back).classList.add('active');});
}

// ── MODALS ──
function initModals(){
    document.querySelectorAll('.select-trigger').forEach(t=>{
        t.onclick=()=>{
            const m=document.getElementById(t.dataset.modal);m.classList.add('open');
            const s=m.querySelector('.modal-search');if(s){s.value='';s.focus();filterOpts(t.dataset.modal,'');}
        };
    });
    document.querySelectorAll('.modal-close, .modal-overlay').forEach(el=>el.onclick=e=>{ if(e.target===el || el.classList.contains('modal-close')) document.querySelectorAll('.modal-overlay').forEach(m=>m.classList.remove('open')); });
    document.querySelectorAll('.modal-option').forEach(opt=>{
        opt.onclick=()=>{
            const list=opt.closest('.modal-list'),tid=list.dataset.target,trid=list.dataset.trigger;
            document.getElementById(tid).value=opt.dataset.value;
            document.getElementById(trid).innerHTML=`<span>${opt.textContent}</span><svg class="icon icon-sm"><use href="#i-down"/></svg>`;
            opt.closest('.modal-overlay').classList.remove('open');
        };
    });
    document.querySelectorAll('.modal-search').forEach(i=>i.oninput=()=>filterOpts(i.dataset.search,i.value));
}
function filterOpts(mid,q){
    const ql=q.toLowerCase();
    document.getElementById(mid).querySelectorAll('.modal-option').forEach(o=>o.style.display=o.textContent.toLowerCase().includes(ql)?'':'none');
}

// ── FILTERS ──
function initFilters(){
    document.querySelectorAll('.filter-chip').forEach(c=>{
        c.onclick=()=>{
            const f=c.dataset.filter;
            if(f==='all'){activeFilters.clear();activeFilters.add('all');}else{activeFilters.delete('all');if(activeFilters.has(f))activeFilters.delete(f);else activeFilters.add(f);if(!activeFilters.size)activeFilters.add('all');}
            document.querySelectorAll('.filter-chip').forEach(x=>x.classList.toggle('active',activeFilters.has(x.dataset.filter)));
            applyFilter();
        };
    });
}
function applyFilter(){
    const tbody=document.getElementById('leadsBody');
    tbody.querySelectorAll('tr').forEach((r,i)=>{
        const l=allLeads[i]; if(!l)return;
        let show=activeFilters.has('all');
        if(activeFilters.has('hot') && l.priority && l.priority.includes('HIGH')) show=true;
        if(activeFilters.has('top') && parseFloat(l.rating)>=4) show=true;
        if(activeFilters.has('phone') && l.phone && l.phone.length > 3) show=true;
        if(activeFilters.has('web') && l.website && l.website !== 'N/A') show=true;
        r.style.display=show?'':'none';
    });
}

// ── MY TASKS ──
async function loadMyTasks(){
    const list=document.getElementById('myTasksList');if(!list)return;
    if(list.children.length > 0 && list.innerHTML.includes('AI Generated')) return; // already loaded ai tasks
    
    const r=await fetch('/api/admin/tasks');const tasks=await r.json();
    list.innerHTML='';
    const mine=tasks.filter(t=>!currentUser||t.assigned_to===currentUser.id||currentUser.role==='admin');
    if(!mine.length){list.innerHTML='<p style="color:var(--text3);font-size:.8rem;padding:1rem;text-align:center;background:rgba(255,255,255,0.02);border-radius:6px;border:1px dashed var(--border)">No tasks assigned yet. Click AI Generate Schedule.</p>';return;}
    mine.forEach(t=>{
        const d=document.createElement('div');d.className='task-card';
        d.innerHTML=`<div><strong>${t.title}</strong><br><span style="font-size:.7rem;color:var(--text3)">${t.status}</span></div>`;
        list.appendChild(d);
    });
}

function generateAITasks() {
    const list = document.getElementById('myTasksList');
    if(!list) return;
    
    const priorityLeads = dbLeads.filter(l => l.priority && l.priority.includes('HIGH')).slice(0, 3);
    const followupLeads = dbLeads.filter(l => l.client_status === 'followup').slice(0, 2);
    
    let html = '';
    
    if(priorityLeads.length > 0) {
        html += `<div style="font-size:.75rem;font-weight:bold;color:var(--text3);margin-top:.5rem">PRIORITY ACTIONS</div>`;
        priorityLeads.forEach(l => {
            html += `<div class="task-card" style="border-left: 3px solid #f44336; cursor:pointer;" onclick="openDetail('${l.lead_id}')">
                <div style="display:flex; justify-content:space-between">
                    <strong>Call ${l.business_name}</strong>
                    <span class="badge badge-high" style="font-size:.6rem">HOT</span>
                </div>
                <div style="font-size:.75rem; color:var(--text3); margin-top:4px;">${l.phone} • High priority lead detected by AI.</div>
            </div>`;
        });
    }
    
    if(followupLeads.length > 0) {
        html += `<div style="font-size:.75rem;font-weight:bold;color:var(--text3);margin-top:.5rem">SCHEDULED FOLLOW-UPS</div>`;
        followupLeads.forEach(l => {
            html += `<div class="task-card" style="border-left: 3px solid #ff9800; cursor:pointer;" onclick="openDetail('${l.lead_id}')">
                <div style="display:flex; justify-content:space-between">
                    <strong>Follow up with ${l.business_name}</strong>
                    <span class="badge badge-med" style="font-size:.6rem">PENDING</span>
                </div>
                <div style="font-size:.75rem; color:var(--text3); margin-top:4px;">Previous status: Follow-up requested.</div>
            </div>`;
        });
    }
    
    html += `<div style="font-size:.75rem;font-weight:bold;color:var(--text3);margin-top:.5rem">GENERAL TASKS</div>
            <div class="task-card" style="border-left: 3px solid #6264a7;">
                <div style="display:flex; justify-content:space-between">
                    <strong>Extract new leads for your territory</strong>
                    <span class="badge badge-contacted" style="font-size:.6rem">DAILY</span>
                </div>
                <div style="font-size:.75rem; color:var(--text3); margin-top:4px;">Run the scraper for at least 50 leads to keep the pipeline full.</div>
            </div>`;
            
    list.innerHTML = html;
}

// ── ADMIN DATA ──
async function loadAdminData(){
    const ur=await fetch('/api/admin/users');const users=await ur.json();
    const al=document.getElementById('agentList');if(al)al.innerHTML='';
    users.forEach(u=>{
        if(al){
            const d=document.createElement('div'); d.className='person-item';
            d.innerHTML=`<div class="p-avatar" style="background:#2a3942">${u.name.charAt(0)}</div><strong>${u.name}</strong><span style="margin-left:auto;font-size:.7rem;color:var(--text3)">${u.role}</span>`;
            al.appendChild(d);
        }
    });
}
