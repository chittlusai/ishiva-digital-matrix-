// ═══════════════════════════════════════════════════════════════
// Chitin Export Data — Frontend Logic v2
// Fixes: chip toggle, advanced filters, search, new extraction
// ═══════════════════════════════════════════════════════════════

let allChitinLeads = [];
let activeConfFilter = 'all';
let activeDataFilter = 'all';

document.addEventListener('DOMContentLoaded', () => {
    initWizard();
    initCountryChips();
    initSourceCards();
    initSlider();
    initConfidenceFilters();
    initAdvancedFilters();
    initExport();
    initLoadPrevious();
});

// ── WIZARD NAVIGATION ──
function initWizard() {
    const panels = ['panel1', 'panel2', 'panel3', 'panel4'];
    const steps  = ['chStep1', 'chStep2', 'chStep3', 'chStep4'];

    window._goToPanel = function(idx) {
        panels.forEach((p, i) => {
            const el = document.getElementById(p);
            if (el) el.classList.toggle('active', i === idx);
        });
        steps.forEach((s, i) => {
            const el = document.getElementById(s);
            if (!el) return;
            el.classList.remove('active', 'completed');
            if (i < idx) el.classList.add('completed');
            if (i === idx) el.classList.add('active');
        });

        const hero = document.getElementById('heroSection');
        if (hero) {
            if (idx > 0) {
                hero.style.opacity = '0'; hero.style.maxHeight = '0';
                hero.style.marginBottom = '0'; hero.style.overflow = 'hidden';
            } else {
                hero.style.opacity = '1'; hero.style.maxHeight = '300px'; hero.style.marginBottom = '2rem';
            }
        }
        if (idx === 3) updateSummary();
    };

    document.getElementById('toStep2').onclick = () => {
        if (getSelectedCountries().length === 0) { toast('error', 'Please select at least one country.'); return; }
        _goToPanel(1);
    };
    document.getElementById('toStep3').onclick = () => {
        if (getSelectedSources().length === 0) { toast('error', 'Please enable at least one source.'); return; }
        _goToPanel(2);
    };
    document.getElementById('toStep4').onclick = () => _goToPanel(3);
    document.getElementById('backStep1').onclick = () => _goToPanel(0);
    document.getElementById('backStep2').onclick = () => _goToPanel(1);
    document.getElementById('backStep3').onclick = () => _goToPanel(2);
    document.getElementById('startExtractBtn').onclick = startExtraction;
}

// ── COUNTRY CHIPS (div-based, no label/input) ──
function initCountryChips() {
    document.querySelectorAll('.ch-country-chip').forEach(chip => {
        chip.addEventListener('click', () => {
            chip.classList.toggle('selected');
        });
    });

    document.getElementById('selectAllBtn').onclick = () => {
        const chips = document.querySelectorAll('.ch-country-chip');
        const allSelected = Array.from(chips).every(c => c.classList.contains('selected'));
        chips.forEach(c => {
            if (allSelected) c.classList.remove('selected');
            else c.classList.add('selected');
        });
        document.getElementById('selectAllBtn').textContent = allSelected ? 'Select All' : 'Deselect All';
    };
}

function getSelectedCountries() {
    return Array.from(document.querySelectorAll('.ch-country-chip.selected')).map(c => c.dataset.country);
}

// ── SOURCE CARDS (div-based, no label/input) ──
function initSourceCards() {
    document.querySelectorAll('.ch-source-card').forEach(card => {
        card.addEventListener('click', () => {
            card.classList.toggle('selected');
        });
    });
}

function getSelectedSources() {
    return Array.from(document.querySelectorAll('.ch-source-card.selected')).map(c => c.dataset.source);
}

// ── SLIDER ──
function initSlider() {
    const slider = document.getElementById('limitSlider');
    const display = document.getElementById('limitDisplay');
    slider.oninput = () => {
        display.textContent = slider.value;
        const mins = Math.round(slider.value * 0.2);
        document.getElementById('estTime').textContent = `${Math.max(3, mins - 3)}-${mins + 5} minutes`;
    };
}

function updateSummary() {
    const countries = getSelectedCountries();
    const sources = getSelectedSources();
    const limit = document.getElementById('limitSlider').value;
    document.getElementById('summaryCountries').textContent = countries.join(', ') || 'None';
    document.getElementById('summarySources').textContent = sources.length === 4 ? 'All 4 layers' : `${sources.length} layer(s)`;
    document.getElementById('summaryLimit').textContent = limit;
}

// ── START EXTRACTION (SSE) ──
function startExtraction() {
    const countries = getSelectedCountries();
    const sources = getSelectedSources();
    const limit = document.getElementById('limitSlider').value;
    if (!countries.length) { toast('error', 'No countries selected!'); return; }
    if (!sources.length) { toast('error', 'No sources selected!'); return; }

    document.getElementById('wizardSection').style.display = 'none';
    document.getElementById('resultsSection').style.display = 'block';
    document.getElementById('maxCount').textContent = limit;

    allChitinLeads = [];
    document.getElementById('resultsBody').innerHTML = '';
    addSkeletonRows(5);

    document.getElementById('statTotal').textContent = '0';
    document.getElementById('statEmails').textContent = '0';
    document.getElementById('statHigh').textContent = '0';
    document.getElementById('statCountries').textContent = '0';

    // Show progress, reset
    const progArea = document.querySelector('.ch-progress-area');
    if (progArea) progArea.style.display = '';
    const spinner = document.querySelector('.ch-spinner');
    if (spinner) spinner.style.display = '';
    document.getElementById('progressBar').style.width = '0%';
    document.getElementById('progressBar').style.background = '';

    const params = new URLSearchParams({ countries: countries.join(','), limit, sources: sources.join(',') });
    const btn = document.getElementById('startExtractBtn');
    btn.disabled = true;

    const es = new EventSource(`/api/chitin/scrape_stream?${params}`);

    es.onmessage = (ev) => {
        const data = JSON.parse(ev.data);
        if (data.status) {
            document.getElementById('statusText').textContent = data.status;
            if (data.status.includes('Layer 1')) activateLayer(1);
            if (data.status.includes('Layer 2') || data.status.includes('Enriching')) activateLayer(2);
            if (data.status.includes('Layer 3')) activateLayer(3);
            if (data.status.includes('Layer 4')) activateLayer(4);
            return;
        }
        if (data.done) {
            es.close();
            document.getElementById('statusText').textContent = `Extraction Complete — ${data.total} leads found`;
            document.querySelector('.ch-spinner').style.display = 'none';
            document.getElementById('progressBar').style.width = '100%';
            document.getElementById('progressBar').style.background = 'linear-gradient(90deg, #16A34A, #22C55E)';
            btn.disabled = false;
            [1,2,3,4].forEach(i => {
                const b = document.getElementById(`layerBadge${i}`);
                b.classList.remove('active'); b.classList.add('done');
            });
            toast('success', `Extracted ${data.total} chitin importer leads!`);
            document.querySelectorAll('.skeleton-row').forEach(r => r.remove());
            populateCountryFilter();
            return;
        }
        if (data.error) { toast('error', data.error); return; }

        if (allChitinLeads.length === 0) document.getElementById('resultsBody').innerHTML = '';
        allChitinLeads.push(data);
        renderRow(data, allChitinLeads.length);
        updateStats();
        const pct = Math.min((allChitinLeads.length / limit) * 100, 100);
        document.getElementById('progressBar').style.width = `${pct}%`;
        document.getElementById('curCount').textContent = allChitinLeads.length;
    };

    es.onerror = () => {
        es.close();
        toast('error', 'Connection lost to extraction engine.');
        btn.disabled = false;
        document.querySelector('.ch-spinner').style.display = 'none';
        document.getElementById('statusText').textContent = 'Connection lost';
        document.querySelectorAll('.skeleton-row').forEach(r => r.remove());
        if (allChitinLeads.length > 0) populateCountryFilter();
    };
}

function activateLayer(num) {
    for (let i = 1; i <= 4; i++) {
        const b = document.getElementById(`layerBadge${i}`);
        if (i < num) { b.classList.remove('active'); b.classList.add('done'); }
        else if (i === num) { b.classList.add('active'); b.classList.remove('done'); }
        else { b.classList.remove('active', 'done'); }
    }
}

function addSkeletonRows(count) {
    const tbody = document.getElementById('resultsBody');
    for (let i = 0; i < count; i++) {
        const tr = document.createElement('tr');
        tr.className = 'skeleton-row';
        tr.innerHTML = `<td><div class="skeleton-bar" style="width:30px"></div></td>
            <td><div class="skeleton-bar" style="width:140px"></div></td>
            <td><div class="skeleton-bar" style="width:80px"></div></td>
            <td><div class="skeleton-bar" style="width:100px"></div></td>
            <td><div class="skeleton-bar" style="width:120px"></div></td>
            <td><div class="skeleton-bar" style="width:90px"></div></td>
            <td><div class="skeleton-bar" style="width:80px"></div></td>
            <td><div class="skeleton-bar" style="width:70px"></div></td>
            <td><div class="skeleton-bar" style="width:70px"></div></td>
            <td><div class="skeleton-bar" style="width:60px"></div></td>`;
        tbody.appendChild(tr);
    }
}

// ── RENDER TABLE ROW ──
function renderRow(lead, idx) {
    const tbody = document.getElementById('resultsBody');
    const tr = document.createElement('tr');
    tr.dataset.confidence = lead.confidence || 'LOW';
    tr.dataset.country = lead.country || '';
    tr.dataset.source = lead.source || '';
    tr.dataset.hasEmail = (lead.email && lead.email !== 'N/A') ? '1' : '0';
    tr.dataset.hasPhone = (lead.phone && lead.phone !== 'N/A') ? '1' : '0';
    tr.dataset.hasLinkedin = (lead.linkedin && lead.linkedin !== 'N/A') ? '1' : '0';
    tr.dataset.company = (lead.company_name || '').toLowerCase();

    const em = tr.dataset.hasEmail === '1' ? `<a href="mailto:${lead.email}" class="td-link">${lead.email}</a>` : '—';
    const web = (lead.website && lead.website !== 'N/A') ? `<a href="${lead.website}" target="_blank" class="td-link">Visit</a>` : '—';
    const li = tr.dataset.hasLinkedin === '1' ? `<a href="${lead.linkedin}" target="_blank" class="td-link">Profile</a>` : '—';

    let confCls = 'ch-badge-low';
    if (lead.confidence === 'HIGH') confCls = 'ch-badge-high';
    else if (lead.confidence === 'MEDIUM') confCls = 'ch-badge-medium';

    let srcCls = 'ch-badge-maps';
    if (lead.source === 'ImportYeti' || lead.source === 'Zauba') srcCls = 'ch-badge-importyeti';
    else if (lead.source === 'Alibaba') srcCls = 'ch-badge-alibaba';

    tr.innerHTML = `
        <td>${idx}</td>
        <td class="td-main">${lead.company_name || 'N/A'}</td>
        <td>${lead.country || 'N/A'}${lead.city && lead.city !== 'N/A' ? ', ' + lead.city : ''}</td>
        <td>${lead.contact_person || 'N/A'}</td>
        <td>${em}</td>
        <td>${lead.phone || 'N/A'}</td>
        <td>${web}</td>
        <td>${li}</td>
        <td><span class="ch-badge ${srcCls}">${lead.source || 'N/A'}</span></td>
        <td><span class="ch-badge ${confCls}">${lead.confidence || 'LOW'}</span></td>
    `;
    tbody.appendChild(tr);
}

// ── UPDATE STATS ──
function updateStats() {
    document.getElementById('statTotal').textContent = allChitinLeads.length;
    document.getElementById('statEmails').textContent = allChitinLeads.filter(l => l.email && l.email !== 'N/A').length;
    document.getElementById('statHigh').textContent = allChitinLeads.filter(l => l.confidence === 'HIGH').length;
    const uc = new Set(allChitinLeads.map(l => l.country).filter(Boolean));
    document.getElementById('statCountries').textContent = uc.size;
}

// ── CONFIDENCE FILTERS (in table header) ──
function initConfidenceFilters() {
    document.querySelectorAll('.ch-filter').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.ch-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeConfFilter = btn.dataset.filter;
            applyAllFilters();
        };
    });
}

// ── ADVANCED FILTERS ──
function initAdvancedFilters() {
    // Data availability toggle buttons
    document.querySelectorAll('.ch-toggle-filter').forEach(btn => {
        btn.onclick = () => {
            document.querySelectorAll('.ch-toggle-filter').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            activeDataFilter = btn.dataset.filter;
            applyAllFilters();
        };
    });

    // Country dropdown
    const countrySelect = document.getElementById('filterCountry');
    if (countrySelect) countrySelect.onchange = () => applyAllFilters();

    // Source dropdown
    const sourceSelect = document.getElementById('filterSource');
    if (sourceSelect) sourceSelect.onchange = () => applyAllFilters();

    // Search input
    const searchInput = document.getElementById('searchLeads');
    if (searchInput) searchInput.oninput = () => applyAllFilters();

    // New Extraction button
    const newBtn = document.getElementById('newExtractionBtn');
    if (newBtn) {
        newBtn.onclick = () => {
            document.getElementById('resultsSection').style.display = 'none';
            document.getElementById('wizardSection').style.display = '';
            _goToPanel(0);
        };
    }
}

function populateCountryFilter() {
    const sel = document.getElementById('filterCountry');
    if (!sel) return;
    const countries = [...new Set(allChitinLeads.map(l => l.country).filter(Boolean))].sort();
    sel.innerHTML = '<option value="all">All Countries</option>';
    countries.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        sel.appendChild(opt);
    });
}

function applyAllFilters() {
    const countryVal = document.getElementById('filterCountry')?.value || 'all';
    const sourceVal = document.getElementById('filterSource')?.value || 'all';
    const searchVal = (document.getElementById('searchLeads')?.value || '').toLowerCase();
    let visible = 0;

    document.querySelectorAll('#resultsBody tr').forEach(row => {
        if (row.classList.contains('skeleton-row')) return;
        let show = true;

        // Confidence filter
        if (activeConfFilter !== 'all' && row.dataset.confidence !== activeConfFilter) show = false;

        // Data availability filter
        if (activeDataFilter === 'hasEmail' && row.dataset.hasEmail !== '1') show = false;
        if (activeDataFilter === 'hasPhone' && row.dataset.hasPhone !== '1') show = false;
        if (activeDataFilter === 'hasLinkedin' && row.dataset.hasLinkedin !== '1') show = false;

        // Country filter
        if (countryVal !== 'all' && row.dataset.country !== countryVal) show = false;

        // Source filter
        if (sourceVal !== 'all' && row.dataset.source !== sourceVal) show = false;

        // Search
        if (searchVal && !(row.dataset.company || '').includes(searchVal)) show = false;

        row.style.display = show ? '' : 'none';
        if (show) visible++;
    });

    const fc = document.getElementById('filteredCount');
    if (fc) {
        if (activeConfFilter !== 'all' || activeDataFilter !== 'all' || countryVal !== 'all' || sourceVal !== 'all' || searchVal) {
            fc.textContent = `(${visible} of ${allChitinLeads.length})`;
        } else {
            fc.textContent = '';
        }
    }
}

// ── EXPORT ──
function initExport() {
    document.getElementById('exportPdfBtn').onclick = () => {
        if (!allChitinLeads.length) { toast('error', 'No data to export'); return; }
        try {
            toast('info', 'Generating Premium PDF...');
            const { jsPDF } = window.jspdf;
            const doc = new jsPDF('l', 'mm', 'a4');

            doc.setFillColor(15, 23, 42);
            doc.rect(0, 0, 297, 42, 'F');
            doc.setFillColor(217, 119, 87);
            doc.rect(0, 42, 297, 3, 'F');

            doc.setTextColor(255, 255, 255);
            doc.setFontSize(22);
            doc.setFont("helvetica", "bold");
            doc.text("CHITIN EXPORT DATA — DIGITAL MATRIX PRO", 15, 20);
            doc.setFontSize(9);
            doc.setFont("helvetica", "normal");
            doc.text(`Generated: ${new Date().toLocaleString()} | HS Code: 3913 10 00 | Total Leads: ${allChitinLeads.length}`, 15, 30);
            doc.text(`Sources: Google Maps, Email Enrichment, ImportYeti, Alibaba`, 15, 36);

            const cols = ["Company", "Country", "Contact", "Email", "Phone", "Website", "Source", "Confidence"];
            const rows = allChitinLeads.map(l => [
                l.company_name || 'N/A',
                `${l.country || ''}${l.city && l.city !== 'N/A' ? ', ' + l.city : ''}`,
                l.contact_person || 'N/A', l.email || 'N/A', l.phone || 'N/A',
                l.website || 'N/A', l.source || 'N/A', l.confidence || 'LOW'
            ]);

            doc.autoTable({
                head: [cols], body: rows, startY: 52, theme: 'striped',
                headStyles: { fillColor: [217, 119, 87], textColor: 255, fontSize: 8, halign: 'center' },
                bodyStyles: { fontSize: 7.5, cellPadding: 2.5 },
                columnStyles: { 3: { textColor: [37, 99, 235] }, 5: { textColor: [217, 119, 87] }, 7: { fontStyle: 'bold' } },
                didDrawCell: (data) => {
                    if (data.column.index === 5 && data.cell.section === 'body' && data.cell.text[0] !== 'N/A') {
                        const url = data.cell.text[0];
                        if (url.startsWith('http')) doc.link(data.cell.x, data.cell.y, data.cell.width, data.cell.height, { url });
                    }
                },
                margin: { left: 10, right: 10 }
            });

            const pageCount = doc.internal.getNumberOfPages();
            for (let i = 1; i <= pageCount; i++) {
                doc.setPage(i);
                doc.setFontSize(7); doc.setTextColor(128, 128, 128);
                doc.text(`Chitin Export Data — Digital Matrix Pro | Page ${i} of ${pageCount}`, 148, 205, { align: 'center' });
            }

            doc.save(`chitin_leads_${new Date().toISOString().split('T')[0]}.pdf`);
            toast('success', 'PDF exported successfully!');
        } catch (e) { console.error(e); toast('error', 'Failed to generate PDF'); }
    };

    document.getElementById('exportExcelBtn').onclick = async () => {
        if (!allChitinLeads.length) { toast('error', 'No data to export'); return; }
        try {
            toast('info', 'Generating Excel...');
            const resp = await fetch('/api/chitin/export_excel', { method: 'POST' });
            if (resp.ok) {
                const blob = await resp.blob();
                const url = URL.createObjectURL(blob);
                const a = document.createElement('a'); a.href = url;
                a.download = `chitin_leads_${new Date().toISOString().split('T')[0]}.xlsx`;
                a.click(); URL.revokeObjectURL(url);
                toast('success', 'Excel exported!');
            } else { toast('error', 'Excel export failed'); }
        } catch (e) { toast('error', 'Excel export failed: ' + e.message); }
    };

    document.getElementById('clearDataBtn').onclick = async () => {
        if (!confirm('Clear all chitin lead data?')) return;
        try {
            await fetch('/api/chitin/leads', { method: 'DELETE' });
            allChitinLeads = [];
            document.getElementById('resultsBody').innerHTML = '';
            updateStats();
            toast('success', 'All data cleared.');
        } catch (e) { toast('error', 'Failed to clear data'); }
    };
}

// ── LOAD PREVIOUS ──
function initLoadPrevious() {
    document.getElementById('loadPrevBtn').onclick = async () => {
        try {
            const resp = await fetch('/api/chitin/leads');
            const db = await resp.json();
            if (db.leads && db.leads.length > 0) {
                allChitinLeads = db.leads;
                document.getElementById('wizardSection').style.display = 'none';
                document.getElementById('resultsSection').style.display = 'block';
                document.querySelector('.ch-progress-area').style.display = 'none';

                const tbody = document.getElementById('resultsBody');
                tbody.innerHTML = '';
                allChitinLeads.forEach((l, i) => renderRow(l, i + 1));
                updateStats();
                populateCountryFilter();

                document.getElementById('maxCount').textContent = allChitinLeads.length;
                document.getElementById('curCount').textContent = allChitinLeads.length;
                toast('success', `Loaded ${allChitinLeads.length} previous leads.`);
            } else {
                toast('info', 'No previous results found.');
            }
        } catch (e) { toast('error', 'Failed to load previous results.'); }
    };
}

// ── TOAST ──
function toast(type, msg) {
    const cont = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = `toast ${type}`;
    const icons = {
        success: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="20 6 9 17 4 12"/></svg>',
        error: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>',
        info: '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>'
    };
    t.innerHTML = `${icons[type] || icons.info} <span>${msg}</span>`;
    cont.appendChild(t);
    setTimeout(() => { t.style.animation = 'fadeUp 0.3s ease reverse forwards'; setTimeout(() => t.remove(), 300); }, 4000);
}
