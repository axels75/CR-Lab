/* =====================================================
   WAVESTONE CR MASTER – agenda.js
   Onglet Agenda/Planning :
   - Vue calendrier mensuel (to-do par code couleur projet)
   - Liste filtrable par statut / projet / groupement
   - Export .ics pour Outlook / Google Calendar / Apple Calendar
   ===================================================== */

/* ---- État local ---- */
let _agendaCurrentDate  = new Date();  // mois affiché
let _agendaStatusFilter = 'all';       // filtre actif
let _agendaAllTodos     = [];          // cache de toutes les tâches
let _agendaInitialized  = false;

/* =====================================================
   POINT D'ENTRÉE : afficher la vue
   ===================================================== */
function showAgendaView() {
  // Mettre à jour le cache des tâches
  _buildAgendaTodos();

  // Remplir le select projets
  _populateAgendaProjectFilter();

  // Render
  _renderAgendaCalendar();
  renderAgendaList();

  showView('viewAgenda');
  setBreadcrumb(['Agenda & Planning']);
}
window.showAgendaView = showAgendaView;

/* =====================================================
   CONSTRUCTION DU CACHE DE TÂCHES
   ===================================================== */
function _buildAgendaTodos() {
  _agendaAllTodos = [];

  (STATE.projects || []).forEach(project => {
    const reports = (STATE.reports || []).filter(r => r.project_id === project.id);
    const color   = project.color || '#002D72';

    reports.forEach(report => {
      let actions = [];
      try { actions = JSON.parse(report.actions || '[]'); } catch {}

      actions.forEach((a, idx) => {
        if (!a.action) return;
        _agendaAllTodos.push({
          id:          `${report.id}-${idx}`,
          actionIndex: idx,
          action:      a.action,
          owner:       a.owner || '',
          due:         a.due   || '',
          status:      a.status || 'todo',
          projectId:   project.id,
          projectName: project.name,
          projectColor: color,
          meetingName: report.meeting_name || report.name || 'Réunion',
          meetingDate: report.meeting_date || '',
          reportId:    report.id,
        });
      });
    });
  });
}

/* =====================================================
   SELECT PROJETS (filtre agenda)
   ===================================================== */
function _populateAgendaProjectFilter() {
  const sel = document.getElementById('agendaProjectFilter');
  if (!sel) return;

  const current = sel.value;
  // Vider sauf "tous"
  while (sel.options.length > 1) sel.remove(1);

  (STATE.projects || []).forEach(p => {
    const opt = document.createElement('option');
    opt.value       = p.id;
    opt.textContent = p.name;
    if (p.id === current) opt.selected = true;
    sel.appendChild(opt);
  });
}

/* =====================================================
   FILTRE STATUT (boutons en haut de la vue)
   ===================================================== */
function filterAgenda(status, btn) {
  _agendaStatusFilter = status;
  document.querySelectorAll('#viewAgenda .pd-filter-btn').forEach(b => b.classList.remove('active'));
  if (btn) btn.classList.add('active');

  _renderAgendaCalendar();
  renderAgendaList();
}
window.filterAgenda = filterAgenda;

/* =====================================================
   CALENDRIER MENSUEL
   ===================================================== */
function _renderAgendaCalendar() {
  const cal     = document.getElementById('agendaCalendar');
  const label   = document.getElementById('agendaMonthLabel');
  if (!cal || !label) return;

  const year  = _agendaCurrentDate.getFullYear();
  const month = _agendaCurrentDate.getMonth();   // 0-indexed

  label.textContent = new Date(year, month, 1)
    .toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });

  // Jours de la semaine (lundi en premier)
  const weekDays = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];

  // Premier jour du mois (0=dim, 1=lun…)
  const firstDow = new Date(year, month, 1).getDay();
  const startOffset = (firstDow === 0 ? 6 : firstDow - 1); // décalage lundi
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  // Indexer les tâches filtrées par date
  const filtered = _getFilteredTodos();
  const todosByDate = {};
  filtered.forEach(t => {
    if (!t.due) return;
    const key = t.due; // 'YYYY-MM-DD'
    if (!todosByDate[key]) todosByDate[key] = [];
    todosByDate[key].push(t);
  });

  const today = new Date();
  const todayStr = _toISODate(today);

  let html = '<div class="agenda-weekdays">';
  weekDays.forEach(d => { html += `<div class="agenda-weekday">${d}</div>`; });
  html += '</div><div class="agenda-days">';

  // Cases vides avant le 1er
  for (let i = 0; i < startOffset; i++) {
    html += '<div class="agenda-day empty"></div>';
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const todos   = todosByDate[dateStr] || [];
    const isToday = dateStr === todayStr;
    const isPast  = dateStr < todayStr;

    html += `<div class="agenda-day${isToday ? ' today' : ''}${isPast ? ' past' : ''}" data-date="${dateStr}">
      <span class="agenda-day-num">${d}</span>
      <div class="agenda-day-dots">`;

    todos.slice(0, 3).forEach(t => {
      html += `<span class="agenda-dot" style="background:${t.projectColor}" title="${_aEsc(t.action)} – ${_aEsc(t.projectName)}"></span>`;
    });
    if (todos.length > 3) {
      html += `<span class="agenda-dot-more">+${todos.length - 3}</span>`;
    }
    html += '</div>';

    // Tooltip des tâches du jour au clic
    if (todos.length > 0) {
      html += `<div class="agenda-day-badge">${todos.length}</div>`;
    }
    html += '</div>';
  }

  html += '</div>';
  cal.innerHTML = html;

  // Clic sur un jour → scroll vers cette date dans la liste
  cal.querySelectorAll('.agenda-day:not(.empty)').forEach(cell => {
    cell.addEventListener('click', () => {
      const date = cell.dataset.date;
      if (!date) return;
      // Passer en mode "par date" et scroller
      const groupSel = document.getElementById('agendaGroupBy');
      if (groupSel) groupSel.value = 'date';
      renderAgendaList();
      setTimeout(() => {
        const target = document.querySelector(`[data-agenda-date="${date}"]`);
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }, 100);
    });
  });
}

function agendaNavMonth(delta) {
  _agendaCurrentDate = new Date(
    _agendaCurrentDate.getFullYear(),
    _agendaCurrentDate.getMonth() + delta,
    1
  );
  _renderAgendaCalendar();
}
window.agendaNavMonth = agendaNavMonth;

function agendaGoToday() {
  _agendaCurrentDate = new Date();
  _renderAgendaCalendar();
}
window.agendaGoToday = agendaGoToday;

/* =====================================================
   LISTE DES TÂCHES
   ===================================================== */
function renderAgendaList() {
  const container = document.getElementById('agendaListContainer');
  if (!container) return;

  const projectFilter = document.getElementById('agendaProjectFilter')?.value || 'all';
  const groupBy       = document.getElementById('agendaGroupBy')?.value || 'project';

  let todos = _getFilteredTodos();
  if (projectFilter !== 'all') {
    todos = todos.filter(t => t.projectId === projectFilter);
  }

  if (todos.length === 0) {
    container.innerHTML = `<div class="pd-empty" style="margin:20px 0;">
      <i class="fa-solid fa-calendar-check" style="font-size:2rem;color:var(--gray-300);margin-bottom:8px;"></i>
      <div>Aucune tâche à afficher avec les filtres sélectionnés.</div>
    </div>`;
    return;
  }

  if (groupBy === 'project') {
    container.innerHTML = _renderByProject(todos);
  } else if (groupBy === 'date') {
    container.innerHTML = _renderByDate(todos);
  } else {
    container.innerHTML = _renderByStatus(todos);
  }
}
window.renderAgendaList = renderAgendaList;

/* Rafraîchissement agenda depuis updateActionStatus (project-dashboard.js) */
function _refreshAgendaAfterStatusChange(reportId, actionIndex, newStatus) {
  // Mettre à jour le cache
  const cached = _agendaAllTodos.find(t =>
    t.reportId === reportId && t.id === `${reportId}-${actionIndex}`
  );
  if (cached) cached.status = newStatus;

  // Rafraîchir seulement si la vue agenda est active
  const agendaView = document.getElementById('viewAgenda');
  if (agendaView && agendaView.classList.contains('active')) {
    _renderAgendaCalendar();
    renderAgendaList();
  }
}
window._refreshAgendaAfterStatusChange = _refreshAgendaAfterStatusChange;

/* --- Groupement par projet --- */
function _renderByProject(todos) {
  const map = new Map();
  todos.forEach(t => {
    if (!map.has(t.projectId)) map.set(t.projectId, { name: t.projectName, color: t.projectColor, items: [] });
    map.get(t.projectId).items.push(t);
  });

  let html = '';
  map.forEach(({ name, color, items }) => {
    html += `
      <div class="agenda-group">
        <div class="agenda-group-header" style="border-left:4px solid ${color};">
          <span class="agenda-group-dot" style="background:${color};"></span>
          <strong>${_aEsc(name)}</strong>
          <span class="pd-count">${items.length}</span>
        </div>
        <div class="agenda-group-body">
          ${items.map(t => _todoRow(t)).join('')}
        </div>
      </div>`;
  });
  return html;
}

/* --- Groupement par date --- */
function _renderByDate(todos) {
  const today   = new Date(); today.setHours(0,0,0,0);
  const noDue   = todos.filter(t => !t.due);
  const withDue = todos.filter(t =>  t.due).sort((a, b) => a.due.localeCompare(b.due));

  const groups = {};
  withDue.forEach(t => {
    const d = new Date(t.due); d.setHours(0,0,0,0);
    const diff = Math.ceil((d - today) / 86400000);
    let key, label;
    if (diff < 0)       { key = 'retard';  label = '⚠️ En retard'; }
    else if (diff === 0){ key = 'today';   label = '📅 Aujourd\'hui'; }
    else if (diff <= 7) { key = 'week';    label = '📆 Cette semaine'; }
    else if (diff <= 31){ key = 'month';   label = '🗓️ Ce mois-ci'; }
    else                { key = 'future';  label = '🔮 Plus tard'; }

    if (!groups[key]) groups[key] = { label, items: [] };
    groups[key].items.push(t);
  });

  const order = ['retard', 'today', 'week', 'month', 'future'];
  let html = '';
  order.forEach(key => {
    if (!groups[key]) return;
    const { label, items } = groups[key];
    const urgent = key === 'retard' || key === 'today';
    html += `
      <div class="agenda-group">
        <div class="agenda-group-header ${urgent ? 'urgent' : ''}" data-agenda-date="${items[0]?.due || ''}">
          <strong>${label}</strong>
          <span class="pd-count">${items.length}</span>
        </div>
        <div class="agenda-group-body">
          ${items.map(t => _todoRow(t, true)).join('')}
        </div>
      </div>`;
  });

  if (noDue.length > 0) {
    html += `
      <div class="agenda-group">
        <div class="agenda-group-header">
          <strong>📋 Sans échéance</strong>
          <span class="pd-count">${noDue.length}</span>
        </div>
        <div class="agenda-group-body">
          ${noDue.map(t => _todoRow(t, true)).join('')}
        </div>
      </div>`;
  }
  return html;
}

/* --- Groupement par statut --- */
function _renderByStatus(todos) {
  const order = ['todo', 'wip', 'blocked', 'done'];
  const labels = { todo: '📌 À faire', wip: '🔄 En cours', blocked: '🚫 Bloquées', done: '✅ Terminées' };
  let html = '';
  order.forEach(st => {
    const items = todos.filter(t => t.status === st);
    if (items.length === 0) return;
    html += `
      <div class="agenda-group">
        <div class="agenda-group-header">
          <strong>${labels[st]}</strong>
          <span class="pd-count">${items.length}</span>
        </div>
        <div class="agenda-group-body">
          ${items.map(t => _todoRow(t)).join('')}
        </div>
      </div>`;
  });
  return html;
}

/* --- Ligne d'une tâche --- */
function _todoRow(t, showProject = false) {
  const today = new Date(); today.setHours(0,0,0,0);
  const overdue = t.due && t.status !== 'done' && new Date(t.due) < today;
  const st = t.status || 'todo';
  const actionIndex = t.actionIndex !== undefined ? t.actionIndex : parseInt(t.id.split('-').pop(), 10);

  return `
    <div class="agenda-todo-row ${overdue ? 'overdue' : ''}" data-todo-id="${t.id}">
      <div class="agenda-todo-color-bar" style="background:${t.projectColor};"></div>
      <div class="agenda-todo-main">
        <div class="agenda-todo-action">${_aEsc(t.action)}</div>
        <div class="agenda-todo-meta">
          ${t.owner ? `<span><i class="fa-solid fa-user" style="font-size:.65rem;"></i> ${_aEsc(t.owner)}</span>` : ''}
          ${showProject ? `<span style="color:${t.projectColor};font-weight:600;">${_aEsc(t.projectName)}</span>` : ''}
          <span><i class="fa-solid fa-file-lines" style="font-size:.65rem;"></i> ${_aEsc(t.meetingName)}</span>
        </div>
      </div>
      <div class="agenda-todo-right">
        ${t.due ? `<div class="agenda-todo-date ${overdue ? 'pd-overdue-date' : ''}">${overdue ? '<i class="fa-solid fa-circle-exclamation"></i> ' : ''}${_formatDueDate(t.due)}</div>` : '<div class="agenda-todo-date" style="color:var(--gray-400);">–</div>'}
        <select class="agenda-status-select agenda-st-${st}"
          onchange="updateActionStatus('${t.reportId}',${actionIndex},this.value,'agenda',this)">
          <option value="todo"    ${st==='todo'    ? 'selected' : ''}>À faire</option>
          <option value="wip"     ${st==='wip'     ? 'selected' : ''}>En cours</option>
          <option value="done"    ${st==='done'    ? 'selected' : ''}>Terminé</option>
          <option value="blocked" ${st==='blocked' ? 'selected' : ''}>Bloqué</option>
        </select>
      </div>
    </div>`;
}

/* =====================================================
   EXPORT ICS
   ===================================================== */
function openAgendaExportModal() {
  // Rebuild todos
  _buildAgendaTodos();

  // Remplir les projets dans la modale
  const projList = document.getElementById('icsProjectList');
  if (projList) {
    projList.innerHTML = (STATE.projects || []).map(p => `
      <label class="agenda-check-label">
        <input type="checkbox" class="ics-project-check" value="${p.id}" checked>
        <span class="agenda-project-dot" style="background:${p.color||'#002D72'};"></span>
        ${_aEsc(p.name)}
      </label>`).join('');
  }

  // Mettre à jour l'aperçu
  _updateICSPreview();

  // Écouter les changements de filtres
  document.querySelectorAll('.ics-status-check, .ics-project-check').forEach(el => {
    el.addEventListener('change', _updateICSPreview);
  });

  openModal('modalAgendaExport');
}
window.openAgendaExportModal = openAgendaExportModal;

function _getICSFiltered() {
  const statuses  = [...document.querySelectorAll('.ics-status-check:checked')].map(el => el.value);
  const projects  = [...document.querySelectorAll('.ics-project-check:checked')].map(el => el.value);

  return _agendaAllTodos.filter(t =>
    statuses.includes(t.status) &&
    projects.includes(t.projectId)
  );
}

function _updateICSPreview() {
  const todos   = _getICSFiltered();
  const counter = document.getElementById('icsPreviewCount');
  const preview = document.getElementById('icsPreview');
  if (counter) counter.textContent = todos.length;
  if (!preview) return;

  if (todos.length === 0) {
    preview.innerHTML = '<div style="color:var(--gray-400);font-style:italic;text-align:center;padding:12px;">Aucune tâche sélectionnée.</div>';
    return;
  }

  preview.innerHTML = todos.slice(0, 10).map(todo => {
    const statusLabel = { todo: window.t('todo'), wip: window.t('in_progress'), done: window.t('done'), blocked: window.t('blocked') };
    return `<div class="ics-preview-row">
      <span class="agenda-project-dot" style="background:${todo.projectColor};"></span>
      <span class="ics-preview-action">${_aEsc(todo.action)}</span>
      <span class="ics-preview-meta">${todo.due ? _formatDueDate(todo.due) : window.t('no_tasks')} · ${_aEsc(todo.projectName)}</span>
      <span class="pd-badge ${{'todo':'pd-badge-todo','wip':'pd-badge-wip','done':'pd-badge-done','blocked':'pd-badge-blocked'}[t.status]}">${statusLabel[t.status]}</span>
    </div>`;
  }).join('');

  if (todos.length > 10) {
    preview.insertAdjacentHTML('beforeend',
      `<div style="text-align:center;padding:8px;color:var(--gray-500);font-size:.8rem;">… et ${todos.length - 10} autre(s)</div>`);
  }
}

function downloadICS() {
  const todos    = _getICSFiltered();
  const duration = document.getElementById('icsDuration')?.value || '60';
  const reminder = parseInt(document.getElementById('icsReminder')?.value || '60', 10);

  if (todos.length === 0) {
    showToast('Aucune tâche sélectionnée.', 'warning');
    return;
  }

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Wavestone CR Master//FR',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'X-WR-CALNAME:CR Master – To-Do',
    'X-WR-TIMEZONE:Europe/Paris',
  ];

  const now = _icsNow();

  todos.forEach(t => {
    const uid     = `crmaster-${t.id}@wavestone`;
    const summary = `[${t.projectName}] ${t.action}`;
    const desc    = [
      t.owner       ? `Responsable : ${t.owner}` : '',
      t.meetingName ? `Réunion : ${t.meetingName}` : '',
      t.meetingDate ? `Date réunion : ${t.meetingDate}` : '',
      `Statut : ${{ todo:'À faire', wip:'En cours', done:'Terminé', blocked:'Bloqué' }[t.status] || t.status}`,
    ].filter(Boolean).join('\\n');

    lines.push('BEGIN:VEVENT');
    lines.push(`UID:${uid}`);
    lines.push(`DTSTAMP:${now}`);
    lines.push(`SUMMARY:${_icsEscape(summary)}`);
    lines.push(`DESCRIPTION:${_icsEscape(desc)}`);
    lines.push(`CATEGORIES:${_icsEscape(t.projectName)}`);
    lines.push(`STATUS:${t.status === 'done' ? 'COMPLETED' : 'NEEDS-ACTION'}`);

    if (t.due) {
      if (duration === 'allday') {
        // Événement journée entière
        const dtDate = t.due.replace(/-/g, '');
        lines.push(`DTSTART;VALUE=DATE:${dtDate}`);
        lines.push(`DTEND;VALUE=DATE:${dtDate}`);
      } else {
        // Heure par défaut : 09:00 Europe/Paris
        const dtStart = t.due.replace(/-/g, '') + 'T090000';
        const durMin  = parseInt(duration, 10) || 60;
        const endH    = 9 + Math.floor(durMin / 60);
        const endM    = durMin % 60;
        const dtEnd   = t.due.replace(/-/g, '') + `T${String(endH).padStart(2,'0')}${String(endM).padStart(2,'0')}00`;
        lines.push(`DTSTART;TZID=Europe/Paris:${dtStart}`);
        lines.push(`DTEND;TZID=Europe/Paris:${dtEnd}`);
      }

      // Rappel
      if (reminder > 0) {
        lines.push('BEGIN:VALARM');
        lines.push('TRIGGER:-PT' + reminder + 'M');
        lines.push('ACTION:DISPLAY');
        lines.push(`DESCRIPTION:Rappel : ${_icsEscape(summary)}`);
        lines.push('END:VALARM');
      }
    } else {
      // Pas de date : événement flottant basé sur aujourd'hui
      lines.push(`DTSTART;VALUE=DATE:${_toISODate(new Date()).replace(/-/g,'')}`);
      lines.push(`DTEND;VALUE=DATE:${_toISODate(new Date()).replace(/-/g,'')}`);
    }

    lines.push('END:VEVENT');
  });

  lines.push('END:VCALENDAR');

  const ics  = lines.join('\r\n');
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href     = url;
  a.download = `CR_Master_ToDo_${_toISODate(new Date())}.ics`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  showToast(`${todos.length} tâche(s) exportée(s) en .ics !`, 'success');
  closeModal('modalAgendaExport');
}
window.downloadICS = downloadICS;

/* =====================================================
   UTILITAIRES
   ===================================================== */
function _getFilteredTodos() {
  if (_agendaStatusFilter === 'all') return _agendaAllTodos;
  return _agendaAllTodos.filter(t => t.status === _agendaStatusFilter);
}

function _aEsc(str) {
  return String(str || '').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function _icsEscape(str) {
  return String(str || '')
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n');
}

function _icsNow() {
  const d = new Date();
  const pad = n => String(n).padStart(2,'0');
  return `${d.getUTCFullYear()}${pad(d.getUTCMonth()+1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
}

function _toISODate(date) {
  const pad = n => String(n).padStart(2,'0');
  return `${date.getFullYear()}-${pad(date.getMonth()+1)}-${pad(date.getDate())}`;
}

function _formatDueDate(iso) {
  if (!iso) return '–';
  try {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  } catch { return iso; }
}
