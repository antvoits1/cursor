'use strict';

const state = {
  mode: document.body.dataset.mode || 'browser',
  view: 'search',
  dossier: null,
  selectedPerson: -1,
  timeline: [],
  rightTab: 'activity',
  mobileView: 'profile',
  lastQuery: '',
  eventSource: null,
  busy: false,
  history: [],
  settings: null,
  bulkJobId: '',
  bulkTimer: null,
  installPrompt: null,
};

const app = document.getElementById('app');

function el(tag, options = {}, children = []) {
  const node = document.createElement(tag);
  if (options.className) node.className = options.className;
  if (options.text !== undefined) node.textContent = String(options.text);
  if (options.id) node.id = options.id;
  if (options.type) node.type = options.type;
  if (options.placeholder) node.placeholder = options.placeholder;
  if (options.value !== undefined) node.value = String(options.value);
  if (options.title) node.title = options.title;
  if (options.style) node.style.cssText = typeof options.style === 'string' ? options.style : '';
  if (options.ariaLabel) node.setAttribute('aria-label', options.ariaLabel);
  if (options.dataset) Object.entries(options.dataset).forEach(([k, v]) => node.dataset[k] = String(v));
  if (options.attrs) Object.entries(options.attrs).forEach(([k, v]) => node.setAttribute(k, String(v)));
  if (options.onClick) node.addEventListener('click', options.onClick);
  if (options.onChange) node.addEventListener('change', options.onChange);
  if (options.onInput) node.addEventListener('input', options.onInput);
  for (const child of children) {
    if (child === null || child === undefined) continue;
    node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

function clear(node) { node.replaceChildren(); }
function text(value, fallback = '—') { return value === null || value === undefined || value === '' ? fallback : String(value); }
function count(arr) { return Array.isArray(arr) ? arr.length : 0; }
function safeUrl(raw) {
  try {
    const url = new URL(String(raw || ''), window.location.origin);
    return ['http:', 'https:'].includes(url.protocol) ? url.href : '';
  } catch { return ''; }
}
function sourceDomain(src) {
  if (src && src.domain) return src.domain;
  const url = safeUrl(src && src.url);
  if (!url) return '';
  try { return new URL(url).hostname; } catch { return ''; }
}
function uniqueSources(sources) {
  const out = [];
  const seen = new Set();
  for (const src of Array.isArray(sources) ? sources : []) {
    const key = `${src && src.label || ''}|${src && src.url || ''}`;
    if (key === '|' || seen.has(key)) continue;
    seen.add(key); out.push(src);
  }
  return out;
}
function formatTime(value) {
  if (!value) return '';
  const d = new Date(value);
  return Number.isNaN(d.getTime()) ? String(value) : d.toLocaleString([], {month:'short', day:'numeric', hour:'numeric', minute:'2-digit'});
}
function toast(message, kind = '') {
  let stack = document.querySelector('.toast-stack');
  if (!stack) { stack = el('div', {className:'toast-stack'}); document.body.append(stack); }
  const item = el('div', {className:`toast ${kind}`.trim(), text:message});
  stack.append(item);
  setTimeout(() => item.remove(), 3800);
}
function button(label, className = 'mini-btn', onClick) { return el('button', {className, text:label, type:'button', onClick}); }
function badge(label, kind = '') { return el('span', {className:`status-badge ${kind}`.trim(), text:label}); }

function buildShell() {
  clear(app);
  const shell = el('div', {className:'shell'});
  const topbar = el('header', {className:'topbar'});
  const brand = el('div', {className:'brand'}, [
    el('div', {className:'brand-mark', text:'IQ'}),
    el('div', {className:'brand-copy'}, [el('div',{className:'brand-title',text:'Intelligence Extractor'}), el('div',{className:'brand-sub',text:'Local corporate intelligence workspace'})])
  ]);
  const query = el('input', {id:'globalQuery', placeholder:'Company, owner, email, phone, domain or URL', ariaLabel:'Research query'});
  query.addEventListener('keydown', ev => { if (ev.key === 'Enter') startSearch(query.value, false); });
  const custom = el('input', {id:'customUrl', placeholder:'Optional direct source URL', ariaLabel:'Optional custom source URL'});
  custom.addEventListener('keydown', ev => { if (ev.key === 'Enter') startSearch(query.value, false); });
  const searchBox = el('div', {className:'searchbox'}, [
    query,
    el('div', {className:'search-suffix'}, [button('Source +', 'mini-btn', () => custom.hidden = !custom.hidden)])
  ]);
  custom.hidden = true;
  const searchArea = el('div', {className:'searchbar'}, [searchBox, button('Research','primary-btn',() => startSearch(query.value,false)), custom]);
  const actions = el('div', {className:'top-actions'}, [
    el('div',{className:'mode-tabs'},[
      button('Research','mode-tab active',() => switchView('search')),
      button('Bulk','mode-tab',() => switchView('bulk'))
    ]),
    button('Research','text-btn mobile-mode-btn',() => switchView('search')),
    button('Bulk','text-btn mobile-mode-btn',() => switchView('bulk')),
    button('History','text-btn',openHistory),
    button('Settings','text-btn',openSettings),
  ]);
  if (state.mode === 'pwa') {
    const install = button('Install','text-btn',async () => {
      if (!state.installPrompt) { toast('Install is available when the browser exposes the PWA install prompt.'); return; }
      state.installPrompt.prompt();
      await state.installPrompt.userChoice;
      state.installPrompt = null;
      install.hidden = true;
    });
    install.id = 'installBtn'; install.hidden = true; actions.append(install);
  }
  topbar.append(brand, searchArea, actions);
  const status = el('div',{className:'status-strip'},[
    el('span',{id:'statusDot',className:'status-dot'}),
    el('span',{id:'statusText',text:'Checking local engine…'}),
    el('span',{className:'status-spacer'}),
    el('span',{id:'statusMeta',text:''})
  ]);
  const body = el('main',{id:'mainView'});
  const mobileNav = el('nav',{className:'mobile-nav',ariaLabel:'Mobile workspace navigation'},[
    button('People','',() => setMobileView('people')),
    button('Profile','active',() => setMobileView('profile')),
    button('Evidence','',() => setMobileView('evidence')),
    button('Activity','',() => {state.rightTab='activity'; setMobileView('activity');})
  ]);
  mobileNav.querySelectorAll('button').forEach(x => x.className='');
  mobileNav.children[1].classList.add('active');
  shell.append(topbar,status,body,mobileNav);
  app.append(shell);
  renderMain();
  checkHealth();
}

function switchView(view) {
  state.view = view;
  document.querySelectorAll('.mode-tab').forEach((tab, i) => tab.classList.toggle('active', (view === 'search' && i===0) || (view==='bulk'&&i===1)));
  renderMain();
}

function setMobileView(view) {
  state.mobileView = view;
  const workspace = document.querySelector('.workspace');
  if (workspace) workspace.dataset.mobileView = view;
  document.querySelectorAll('.mobile-nav button').forEach(btn => btn.classList.toggle('active', btn.textContent.toLowerCase() === view));
  if (view === 'evidence') { state.rightTab = 'sources'; renderRightPanel(); }
  if (view === 'activity') { state.rightTab = 'activity'; renderRightPanel(); }
}

async function checkHealth() {
  try {
    const res = await fetch('/api/v1/health', {cache:'no-store'});
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    const dot = document.getElementById('statusDot');
    dot.className = 'status-dot ready';
    document.getElementById('statusText').textContent = `Local engine ready · ${data.engine_version}`;
    const caps = [];
    if (data.dns) caps.push('DNS');
    if (data.playwright) caps.push('Browser');
    if (data.bulk && data.bulk.xlsx) caps.push('XLSX');
    if (data.bulk && data.bulk.pdf) caps.push('PDF');
    if (data.bulk && data.bulk.ocr) caps.push('OCR');
    document.getElementById('statusMeta').textContent = caps.join(' · ');
    if (state.mode === 'pwa' && !window.isSecureContext && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
      document.getElementById('statusMeta').textContent = 'Mobile view ready · secure HTTPS required for PWA installation';
    }
  } catch (err) {
    document.getElementById('statusDot').className = 'status-dot error';
    document.getElementById('statusText').textContent = 'Local engine unavailable';
    document.getElementById('statusMeta').textContent = String(err.message || err);
  }
}

function setBusy(value, label = '') {
  state.busy = value;
  const dot = document.getElementById('statusDot');
  if (dot) dot.className = `status-dot ${value ? 'busy' : 'ready'}`;
  const status = document.getElementById('statusText');
  if (status && label) status.textContent = label;
}

function renderMain() {
  const main = document.getElementById('mainView');
  if (!main) return;
  clear(main);
  if (state.view === 'bulk') { main.append(buildBulkPage()); return; }
  const workspace = el('div',{className:'workspace original-workspace'}); workspace.dataset.mobileView = state.mobileView;
  workspace.append(buildPermanentTimelinePanel(),buildCenterPanel());
  main.append(workspace);
}

function buildPermanentTimelinePanel() {
  const panel = el('aside',{className:'panel timeline-panel'});
  panel.append(el('div',{className:'panel-head'},[
    el('div',{className:'panel-title',text:'Granular Route Timeline'}),
    el('div',{className:'panel-subtle',text:state.busy?'LIVE':(state.timeline.length?`${state.timeline.length} events`:'Ready')})
  ]));
  const body=el('div',{className:'panel-body timeline-panel-body'});
  renderActivity(body);
  panel.append(body);
  return panel;
}

function buildLeftPanel() {
  const panel = el('section',{className:'panel left-panel'});
  panel.append(el('div',{className:'panel-head'},[el('div',{className:'panel-title',text:'Company & People'}),el('div',{className:'panel-subtle',text:state.dossier?`${count(state.dossier.people)} people`:''})]));
  const body = el('div',{className:'panel-body'});
  if (!state.dossier) {
    body.append(el('div',{className:'empty-state',text:'Run a research query to build a company dossier and person list.'}));
  } else {
    const entity = state.dossier.entity || {};
    const people = state.dossier.people || [];
    const company = el('button',{className:`person-row ${state.selectedPerson===-1?'active':''}`,type:'button',onClick:()=>{state.selectedPerson=-1;renderMain();}},[
      el('div',{},[el('span',{className:'person-name',text:text(entity.name,'Company')}),el('span',{className:'person-role',text:text(entity.official_domain,'Company profile')})]),
      el('div',{className:'person-count'},[el('span',{className:'count-pill',text:count(entity.phones)}),el('span',{className:'count-pill',text:count(entity.emails)})])
    ]);
    body.append(company);
    body.append(el('div',{className:'section-kicker',text:'People'}));
    const list=el('div',{className:'person-list'});
    people.forEach((p,i)=>{
      const row=el('button',{className:`person-row ${state.selectedPerson===i?'active':''}`,type:'button',onClick:()=>{state.selectedPerson=i;renderMain();}},[
        el('div',{},[el('span',{className:'person-name',text:text(p.name,'Unnamed')}),el('span',{className:'person-role',text:text(p.role || (p.roles||[]).join(', '),'Executive / Contact')})]),
        el('div',{className:'person-count'},[el('span',{className:'count-pill',text:count(p.direct_phones)}),el('span',{className:'count-pill',text:count(p.direct_emails)})])
      ]); list.append(row);
    });
    if (!people.length) list.append(el('div',{className:'empty-state',text:'No named owners or senior contacts have been confirmed yet.'}));
    body.append(list);
  }
  panel.append(body); return panel;
}

function buildCenterPanel() {
  const panel=el('section',{className:'panel center-panel'});
  if (!state.dossier) {
    panel.append(el('div',{className:'hero'},[el('div',{className:'hero-main'},[el('div',{className:'hero-eyebrow',text:'Corporate intelligence workspace'}),el('h1',{className:'hero-title',text:'Search a company, owner, email, phone, domain or URL'}),el('div',{className:'hero-role',text:'Results are organized into company records, people, evidence and source history.'})])]),buildLandingCards());
    return panel;
  }
  const entity=state.dossier.entity||{};
  const person=state.selectedPerson>=0?(state.dossier.people||[])[state.selectedPerson]:null;
  const title=person?text(person.name,'Person'):text(entity.name,'Company');
  const role=person?text(person.role || (person.roles||[]).join(', '),'Executive / Contact'):text(entity.official_domain,'Company intelligence profile');
  const evidence=person?uniqueSources(person.evidence_sources):uniqueSources(state.dossier.sources);
  const hero=el('div',{className:'hero'},[
    el('div',{className:'hero-main'},[el('div',{className:'hero-eyebrow',text:person?'Person intelligence':'Company intelligence'}),el('h1',{className:'hero-title',text:title}),el('div',{className:'hero-role',text:role})]),
    el('div',{className:'hero-actions'},[
      button(`Evidence · ${evidence.length}`,'soft-btn',()=>openEvidenceDrawer(`${title} evidence`,evidence)),
      button('JSON','soft-btn',exportCurrentJson),
      button('CSV','soft-btn',exportCurrentCsv),
      ...(person?[button('vCard','soft-btn',()=>exportVcard(person,entity))]:[]),
      button('Refresh','primary-btn',()=>startSearch(state.lastQuery||state.dossier.query,true))
    ])
  ]);
  panel.append(hero);
  const grid=el('div',{className:'profile-grid'});
  if (person) buildPersonCards(grid,person,entity); else buildCompanyCards(grid,entity);
  panel.append(grid); return panel;
}

function buildLandingCards() {
  const grid=el('div',{className:'profile-grid'});
  const items=[
    ['Person-centric','Owners, partners and executives receive their own phones, emails, addresses, relationships and evidence trail.'],
    ['Source evidence','Verification URLs are kept in organized evidence drawers instead of crowding each contact value.'],
    ['Bulk enrichment','Switch to Bulk for XLSX, CSV, TSV, PDF and local OCR-based image processing.'],
    ['Local persistence','Dossiers, history, settings and merges persist in the local SQLite database.']
  ];
  items.forEach(([a,b])=>grid.append(el('section',{className:'info-card'},[el('div',{className:'info-card-head'},[el('div',{className:'info-card-title',text:a})]),el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-meta',text:b})])])])));
  return grid;
}

function infoCard(title, records, renderRecord, wide=false) {
  const card=el('section',{className:`info-card ${wide?'wide':''}`.trim()});
  card.append(el('div',{className:'info-card-head'},[el('div',{className:'info-card-title',text:title}),el('div',{className:'info-card-count',text:String(count(records))})]));
  const list=el('div',{className:'info-list'});
  if (!records || !records.length) list.append(el('div',{className:'empty-state',text:`No ${title.toLowerCase()} confirmed.`}));
  else records.forEach(r=>list.append(renderRecord(r)));
  card.append(list); return card;
}

function buildPersonCards(grid,p,entity) {
  grid.append(infoCard('Direct phones',p.direct_phones,phoneRow));
  grid.append(infoCard('Direct emails',p.direct_emails,emailRow));
  grid.append(infoCard('Associated addresses',p.associated_addresses,addressRow,true));
  grid.append(infoCard('Relationships',p.relatives_and_associates,relationshipRow));
  const roles=(p.roles||[]).map(role=>({role}));
  grid.append(infoCard('Roles & relationship',roles.length?roles:[{role:p.role||p.corporate_relationship||''}],r=>simpleRow(r.role)));
  const evidence=uniqueSources(p.evidence_sources);
  grid.append(infoCard('Evidence summary',evidence,sourceCompactRow,true));
}
function buildCompanyCards(grid,e) {
  grid.append(infoCard('Company phones',e.phones,phoneRow));
  grid.append(infoCard('Company emails',e.emails,emailRow));
  grid.append(infoCard('Locations',e.addresses,addressRow,true));
  const people=(state.dossier&&state.dossier.people)||[];
  grid.append(infoCard('Owners, executives & senior contacts',people,p=>{
    const row=el('button',{className:'info-row person-profile-row',type:'button',onClick:()=>{
      const idx=people.indexOf(p); state.selectedPerson=idx; renderMain();
    }});
    row.append(el('div',{className:'info-row-main'},[
      el('div',{className:'info-value',text:text(p.name,'Unnamed')}),
      el('div',{className:'info-meta',text:text(p.role || (p.roles||[]).join(', '),'Executive / Contact')})
    ]),el('div',{className:'info-actions'},[sourceButton(p.evidence_sources)]));
    return row;
  },true));
  const meta=Object.entries(e.metadata||{}).map(([key,value])=>({key,value}));
  grid.append(infoCard('Company metadata',meta,r=>simpleRow(`${friendlyKey(r.key)}: ${text(r.value)}`)));
  grid.append(infoCard('Social profiles',e.socials||[],r=>sourceCompactRow({label:r.label||sourceDomain(r),url:r.url,domain:sourceDomain(r)})));
  grid.append(infoCard('Audited sources',uniqueSources(state.dossier&&state.dossier.sources),sourceCompactRow,true));
}
function friendlyKey(k){return String(k||'').replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase());}
function simpleRow(value,meta='') { return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(value)}),...(meta?[el('div',{className:'info-meta',text:meta})]:[])])]); }
function sourceButton(sources) { const clean=uniqueSources(sources); return button(`Sources · ${clean.length}`,'mini-btn',()=>openEvidenceDrawer('Supporting evidence',clean)); }
function phoneRow(p) {
  const actions=el('div',{className:'info-actions'});
  const digits=String(p.digits||p.e164||p.number||'').replace(/\D/g,'');
  if (digits) { actions.append(button('Call','mini-btn',()=>location.href=`tel:${digits}`),button('SMS','mini-btn',()=>location.href=`sms:${digits}`)); }
  actions.append(sourceButton(p.sources));
  return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(p.number)}),el('div',{className:'info-meta'},[el('span',{text:text(p.line_type,'Line type unknown')}),el('span',{text:text(p.carrier,'Carrier unknown')}),...(p.region?[el('span',{text:p.region})]:[])])]),actions]);
}
function emailRow(e) {
  const kind=e.smtp_status==='active_inbox'?'good':e.mx_status==='no_mail_server'||e.smtp_status==='rejected'?'bad':e.mx_status==='active'?'warn':'';
  const status=e.smtp_status==='active_inbox'?'Active inbox':e.smtp_status==='catch_all'?'Catch-all':e.mx_status==='no_mail_server'?'No mail server':e.smtp_status==='rejected'?'Rejected':e.mx_status==='active'?'MX active':'Unverified';
  return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(e.email)}),el('div',{className:'info-meta'},[badge(status,kind),...(e.domain_match?[badge('Domain match','good')]:[])])]),el('div',{className:'info-actions'},[button('Email','mini-btn',()=>location.href=`mailto:${e.email}`),sourceButton(e.sources)])]);
}
function addressRow(a) { return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(a.address)}),el('div',{className:'info-meta',text:'Physical address'})]),el('div',{className:'info-actions'},[sourceButton(a.sources)])]); }
function relationshipRow(r) { return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(r.name)}),el('div',{className:'info-meta',text:text(r.relationship,'Associated person')})]),el('div',{className:'info-actions'},[sourceButton(r.sources||r.evidence_sources)])]); }
function sourceCompactRow(src) { return el('div',{className:'info-row'},[el('div',{className:'info-row-main'},[el('div',{className:'info-value',text:text(src.label,'Source')}),el('div',{className:'info-meta',text:text(sourceDomain(src),'Evidence record')})]),el('div',{className:'info-actions'},[button('Open','mini-btn',()=>openSource(src))])]); }

function buildRightPanel() {
  const panel=el('aside',{className:'panel right-panel',id:'rightPanel'});
  panel.append(el('div',{className:'panel-head'},[el('div',{className:'panel-title',text:'Evidence Workspace'}),el('div',{className:'panel-subtle',text:state.dossier?`${count(state.dossier.sources)} sources`:''})]));
  const tabs=el('div',{className:'right-tabs'});
  [['activity','Activity'],['sources','Sources'],['snapshots','Snapshots']].forEach(([key,label])=>tabs.append(el('button',{className:`right-tab ${state.rightTab===key?'active':''}`,text:label,type:'button',onClick:()=>{state.rightTab=key;renderRightPanel();}})));
  panel.append(tabs,buildRightBody()); return panel;
}
function renderRightPanel(){ const current=document.getElementById('rightPanel'); if(current) current.replaceWith(buildRightPanel()); }
function buildRightBody() {
  const body=el('div',{className:'panel-body'});
  if (!state.dossier && !state.timeline.length) { body.append(el('div',{className:'empty-state',text:'Source activity, evidence and page previews appear here during research.'})); return body; }
  if (state.rightTab==='sources') renderSources(body); else if(state.rightTab==='snapshots') renderSnapshots(body); else renderActivity(body);
  return body;
}
function renderActivity(body) {
  const req=state.dossier&&state.dossier.audit&&state.dossier.audit.requests||{};
  const audit=el('div',{className:'audit-box'});
  [['Attempted',req.attempted||0],['Successful',req.successful||0],['Blocked',req.blocked||0],['Failed',req.failed||0]].forEach(([k,v])=>audit.append(el('div',{className:'audit-cell'},[el('span',{text:k}),el('strong',{text:v})])));
  body.append(audit);
  const timeline=el('div',{className:'timeline'});
  state.timeline.slice(-60).reverse().forEach(item=>{
    const type=String(item.type||'').toUpperCase();
    const cls=type.includes('COMPLETE')||type.includes('CAPTURED')||type==='CACHE_HIT'?'success':type.includes('429')||type.includes('CHALLENGE')||type.includes('BLOCKED')?'warning':type.includes('ERROR')||type.includes('FAILED')?'failure':'';
    timeline.append(el('div',{className:'timeline-item'},[el('div',{className:`timeline-dot ${cls}`.trim()}),el('div',{},[el('div',{className:'timeline-message',text:text(item.message,'Activity event')}),el('div',{className:'timeline-time',text:formatTime(item.timestamp)})])]));
  });
  if(!state.timeline.length) timeline.append(el('div',{className:'empty-state',text:'No live activity in this session.'}));
  body.append(timeline);
}
function renderSources(body) {
  const sources=uniqueSources(state.dossier&&state.dossier.sources);
  const list=el('div',{className:'source-list'});
  sources.forEach(src=>list.append(sourceRow(src)));
  if(!sources.length) list.append(el('div',{className:'empty-state',text:'No source evidence stored yet.'}));
  body.append(list);
}
function sourceRow(src) {
  const row=el('div',{className:'source-row'});
  row.append(el('div',{className:'source-row-top'},[el('div',{className:'source-name',text:text(src.label,'Source')}),...(src.confidence?[badge(src.confidence)]:[])]),el('div',{className:'source-domain',text:text(sourceDomain(src),'URL not recorded')}));
  const actions=el('div',{className:'source-actions'});
  if(safeUrl(src.url)) actions.append(button('Open','mini-btn',()=>openSource(src)),button('Snapshot','mini-btn',()=>captureSnapshot(src)));
  row.append(actions); return row;
}
function renderSnapshots(body) {
  const shots=state.dossier&&state.dossier.snapshots||[];
  const grid=el('div',{className:'snapshot-grid'});
  shots.forEach(shot=>{
    const image=safeUrl(shot.image_url) || (String(shot.image_url||'').startsWith('/')?shot.image_url:'');
    const img=el('img',{attrs:{alt:`${text(shot.label,'Source')} page preview`,loading:'lazy'}}); if(image) img.src=image;
    const card=el('button',{className:'snapshot',type:'button',onClick:()=>{const url=safeUrl(shot.source_url);if(url)window.open(url,'_blank','noopener,noreferrer');}},[img,el('div',{className:'snapshot-copy'},[el('div',{className:'snapshot-title',text:text(shot.label,'Source')}),el('div',{className:'snapshot-time',text:formatTime(shot.captured_at)})])]); grid.append(card);
  });
  if(!shots.length) body.append(el('div',{className:'empty-state',text:'No page previews captured yet. Snapshot capture uses the local Playwright browser when available.'})); else body.append(grid);
}

function openSource(src) { const url=safeUrl(src&&src.url); if(url) window.open(url,'_blank','noopener,noreferrer'); else toast('This source does not have a valid web URL.','error'); }
function openEvidenceDrawer(title,sources) {
  const backdrop=el('div',{className:'drawer-backdrop'}); const drawer=el('aside',{className:'drawer'});
  const head=el('div',{className:'drawer-head'},[el('div',{className:'drawer-title',text:title}),el('div',{style:'flex:1'}),button('Close','mini-btn',()=>backdrop.remove())]);
  const body=el('div',{className:'drawer-body'}); const list=el('div',{className:'source-list'}); uniqueSources(sources).forEach(src=>list.append(sourceRow(src))); if(!list.children.length)list.append(el('div',{className:'empty-state',text:'No supporting source records are attached.'})); body.append(list); drawer.append(head,body); backdrop.append(drawer); backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove();}); document.body.append(backdrop);
}

async function captureSnapshot(src) {
  if(!state.dossier) return;
  try{
    const res=await fetch('/api/v1/snapshots/capture',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({url:src.url,label:src.label,cache_key:state.dossier.cache_key})});
    const data=await res.json(); if(!res.ok) throw new Error(data.detail||`HTTP ${res.status}`);
    state.dossier.snapshots=state.dossier.snapshots||[]; state.dossier.snapshots.push(data.snapshot); state.dossier.snapshots=dedupeSnapshots(state.dossier.snapshots); toast('Page preview captured.','success'); state.rightTab='snapshots'; renderRightPanel();
  }catch(err){toast(`Snapshot unavailable: ${err.message||err}`,'error');}
}
function dedupeSnapshots(items){const map=new Map();(items||[]).forEach(x=>map.set(x.source_url||x.image_url,x));return [...map.values()].slice(-6);}

function startSearch(raw,refresh=false) {
  const query=String(raw||'').trim(); if(!query){toast('Enter a company, person, email, phone, domain or URL.','error');return;}
  if(state.eventSource) state.eventSource.close();
  state.view='search'; state.lastQuery=query; state.timeline=[]; state.busy=true; state.selectedPerson=-1; renderMain(); setBusy(true,`Researching ${query}…`);
  const customInput=document.getElementById('customUrl'); const customs=[]; if(customInput&&customInput.value.trim()) customs.push(customInput.value.trim());
  const params=new URLSearchParams({query,custom_urls:JSON.stringify(customs),refresh:refresh?'true':'false'});
  const es=new EventSource(`/api/v1/research/stream?${params.toString()}`); state.eventSource=es;
  es.onmessage=ev=>{
    let event; try{event=JSON.parse(ev.data);}catch{return;}
    state.timeline.push(event); if(state.timeline.length>150)state.timeline.shift();
    if(event.type==='COMPLETE'||event.type==='CACHE_HIT'){state.dossier=event.data; state.lastQuery=(event.data&&event.data.ui_state&&event.data.ui_state.lastQuery)||query; state.busy=false; es.close(); state.eventSource=null; setBusy(false,'Local engine ready'); renderMain(); toast(event.type==='CACHE_HIT'?'Loaded fresh cached dossier.':'Research completed.','success');return;}
    if(event.type==='ERROR'||event.type==='SSRF_BLOCKED'){state.busy=false;es.close();state.eventSource=null;setBusy(false,'Research stopped');renderRightPanel();toast(event.message||'Research failed.','error');return;}
    const meta=document.getElementById('statusMeta'); if(meta)meta.textContent=event.message||''; renderRightPanel();
  };
  es.onerror=()=>{if(state.busy){state.busy=false;setBusy(false,'Research connection closed');toast('The research stream closed before completion.','error');}es.close();state.eventSource=null;};
}

async function openHistory() {
  try { const res=await fetch('/api/v1/history',{cache:'no-store'}); if(!res.ok)throw new Error(`HTTP ${res.status}`); state.history=await res.json(); }
  catch(err){toast(`History unavailable: ${err.message||err}`,'error');return;}
  const backdrop=el('div',{className:'drawer-backdrop'}),drawer=el('aside',{className:'drawer'}),head=el('div',{className:'drawer-head'},[el('div',{className:'drawer-title',text:'Research History'}),el('div',{style:'flex:1'}),button('Clear','mini-btn',clearHistory),button('Close','mini-btn',()=>backdrop.remove())]),body=el('div',{className:'drawer-body'}),list=el('div',{className:'history-list'});
  state.history.forEach(item=>{const row=el('div',{className:'history-row'},[el('div',{},[el('div',{className:'history-name',text:text(item.company_name,item.query_text)}),el('div',{className:'history-meta',text:`${text(item.state,'No state')} · ${item.phones_count||0} phones · ${item.emails_count||0} emails · ${formatTime(item.updated_at)}`})]),el('div',{},[button('Open','mini-btn',async()=>{await loadHistory(item.id);backdrop.remove();}),button('Delete','mini-btn',async()=>{await deleteHistory(item.id);row.remove();})])]);list.append(row);});
  if(!state.history.length)list.append(el('div',{className:'empty-state',text:'No saved dossiers yet.'}));body.append(list);drawer.append(head,body);backdrop.append(drawer);backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove();});document.body.append(backdrop);
}
async function loadHistory(id){try{const res=await fetch(`/api/v1/history/${id}`,{cache:'no-store'});const d=await res.json();if(!res.ok)throw new Error(d.detail||`HTTP ${res.status}`);state.dossier=d;state.lastQuery=(d.ui_state&&d.ui_state.lastQuery)||d.query||'';state.selectedPerson=-1;state.timeline=[];state.view='search';const input=document.getElementById('globalQuery');if(input)input.value=state.lastQuery;renderMain();toast('Saved dossier loaded.','success');}catch(err){toast(`Could not load history: ${err.message||err}`,'error');}}
async function deleteHistory(id){try{const res=await fetch(`/api/v1/history/${id}`,{method:'DELETE'});if(!res.ok)throw new Error(`HTTP ${res.status}`);toast('History record deleted.','success');}catch(err){toast(`Delete failed: ${err.message||err}`,'error');}}
async function clearHistory(){if(!confirm('Clear all saved dossier history?'))return;try{const res=await fetch('/api/v1/history',{method:'DELETE'});if(!res.ok)throw new Error(`HTTP ${res.status}`);document.querySelector('.drawer-backdrop')?.remove();state.history=[];toast('History cleared.','success');}catch(err){toast(`History clear failed: ${err.message||err}`,'error');}}

async function openSettings(){
  try{const res=await fetch('/api/v1/settings',{cache:'no-store'});if(!res.ok)throw new Error(`HTTP ${res.status}`);state.settings=await res.json();}catch(err){toast(`Settings unavailable: ${err.message||err}`,'error');return;}
  const s=state.settings;const backdrop=el('div',{className:'modal-backdrop'}),modal=el('section',{className:'modal'}),head=el('div',{className:'modal-head'},[el('div',{className:'modal-title',text:'Local Engine Settings'}),el('div',{style:'flex:1'}),button('Close','mini-btn',()=>backdrop.remove())]),body=el('div',{className:'modal-body'}),error=el('div',{className:'form-error'});error.hidden=true;
  const proxy=el('input',{placeholder:s.proxy_configured?`Configured: ${s.proxy_display}`:'http://user:pass@host:port'}),ttl=el('input',{type:'number',value:s.cache_ttl_days,attrs:{min:'1',max:'90'}}),concurrency=el('input',{type:'number',value:s.max_concurrency,attrs:{min:'1',max:'12'}}),phoneSeeds=el('input',{type:'number',value:s.max_phone_seeds,attrs:{min:'1',max:'20'}}),smtp=el('input',{type:'checkbox',className:'toggle'}),shots=el('input',{type:'checkbox',className:'toggle'});smtp.checked=!!s.smtp_checks;shots.checked=!!s.snapshots_enabled;
  const form=el('div',{className:'form-grid'},[
    fieldWrap('Optional proxy',proxy,'Used by curl_cffi and Playwright. Leave blank to keep the currently configured proxy.'),fieldWrap('Cache TTL (days)',ttl,'1–90 days'),fieldWrap('Max concurrent requests',concurrency,'1–12'),fieldWrap('Max phone seeds',phoneSeeds,'Limits reverse-phone fan-out per company'),
    el('div',{className:'field wide'},[el('div',{className:'toggle-row'},[el('div',{className:'toggle-copy'},[el('strong',{text:'SMTP mailbox checks'}),el('span',{text:'Non-intrusive mailbox handshake after MX validation.'})]),smtp])]),
    el('div',{className:'field wide'},[el('div',{className:'toggle-row'},[el('div',{className:'toggle-copy'},[el('strong',{text:'Page snapshots'}),el('span',{text:'Capture compact source previews using the local Playwright browser.'})]),shots])]),
  ]);body.append(error,form);
  const foot=el('div',{className:'modal-foot'},[button('Export SQLite','text-btn',downloadDatabase),button('Clear proxy','text-btn',()=>{proxy.value='';proxy.dataset.clear='1';}),button('Save','primary-btn',async()=>{error.hidden=true;const payload={cache_ttl_days:Number(ttl.value),max_concurrency:Number(concurrency.value),max_phone_seeds:Number(phoneSeeds.value),smtp_checks:smtp.checked,snapshots_enabled:shots.checked};if(proxy.value.trim()||proxy.dataset.clear==='1')payload.proxy_url=proxy.value.trim();try{const res=await fetch('/api/v1/settings',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(payload)});const d=await res.json();if(!res.ok)throw new Error(d.detail||`HTTP ${res.status}`);toast('Settings saved.','success');backdrop.remove();}catch(err){error.textContent=err.message||String(err);error.hidden=false;}})]);
  modal.append(head,body,foot);backdrop.append(modal);backdrop.addEventListener('click',e=>{if(e.target===backdrop)backdrop.remove();});document.body.append(backdrop);
}
function fieldWrap(labelText,input,note){return el('div',{className:'field'},[el('label',{text:labelText}),input,el('div',{className:'field-note',text:note})]);}
async function downloadDatabase(){try{const res=await fetch('/api/v1/export/database');if(!res.ok)throw new Error(`HTTP ${res.status}`);const blob=await res.blob();downloadBlob(blob,filenameFromDisposition(res.headers.get('Content-Disposition'))||'extractor-backup.sqlite');}catch(err){toast(`Database export failed: ${err.message||err}`,'error');}}

function buildBulkPage(){
  const page=el('div',{className:'bulk-page'});const fileInput=el('input',{type:'file',attrs:{accept:'.xlsx,.csv,.tsv,.pdf,.png,.jpg,.jpeg,.webp,.tif,.tiff,.bmp'}});fileInput.hidden=true;
  const drop=el('div',{className:'dropzone'},[el('div',{className:'dropzone-title',text:'Drop a lead file here'}),el('div',{className:'dropzone-sub',text:'XLSX · CSV · TSV · PDF · local image OCR'}),button('Choose file','primary-btn',()=>fileInput.click()),fileInput]);
  fileInput.addEventListener('change',()=>{if(fileInput.files[0])startBulkUpload(fileInput.files[0]);});
  ['dragenter','dragover'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.add('drag');}));['dragleave','drop'].forEach(name=>drop.addEventListener(name,e=>{e.preventDefault();drop.classList.remove('drag');}));drop.addEventListener('drop',e=>{const f=e.dataTransfer.files[0];if(f)startBulkUpload(f);});
  const hero=el('section',{className:'bulk-hero'},[el('div',{},[el('h1',{className:'bulk-title',text:'Bulk Lead Extractor'}),el('div',{className:'bulk-desc',text:'Upload a structured lead sheet or local document. Each detected lead is processed through the same person-centric research engine used by single-company searches, then exported as multi-record enriched CSV or Excel.'})]),drop]);
  page.append(hero,buildBulkDashboard());return page;
}
function buildBulkDashboard(){
  const wrap=el('div',{className:'bulk-dashboard'});const status=el('section',{className:'bulk-status'}),results=el('section',{className:'bulk-results'});
  const job=window.__bulkState||{status:'idle',total:0,current:0,completed:0,failed:0,progress:0,message:'No job running',recent_results:[]};
  status.append(el('div',{className:'panel-title',text:'Queue'}),el('div',{className:'company-name',text:text(job.filename,'Ready for upload')}),el('div',{className:'progress-track'},[el('div',{className:'progress-bar',attrs:{style:`width:${Math.min(100,Number(job.progress||0))}%`}})]),el('div',{className:'progress-copy',text:job.message||job.status}),el('div',{className:'bulk-metrics'},[
    metric('Total',job.total||0),metric('Done',job.completed||0),metric('Failed',job.failed||0)
  ]));
  const actionRow=el('div',{className:'source-actions'});if(state.bulkJobId){actionRow.append(button('Export CSV','mini-btn',()=>downloadBulk('csv')),button('Export XLSX','mini-btn',()=>downloadBulk('xlsx')));if(job.status==='running'||job.status==='queued')actionRow.append(button('Cancel','mini-btn',cancelBulk));}status.append(actionRow);
  const head=el('div',{className:'panel-head'},[el('div',{className:'panel-title',text:'Recent Results'}),el('div',{className:'panel-subtle',text:job.status||''})]);const table=el('table',{className:'results-table'});const tr=el('tr');['#','Company','People','Phones','Emails','Status'].forEach(h=>tr.append(el('th',{text:h})));table.append(el('thead',{},[tr]));const tbody=el('tbody');(job.recent_results||[]).forEach(r=>{const row=el('tr');[r.index,text(r.company,r.query),r.people||0,r.phones||0,r.emails||0,r.error?'Error':'Complete'].forEach(v=>row.append(el('td',{text:v})));tbody.append(row);});if(!(job.recent_results||[]).length){const row=el('tr');const td=el('td',{text:'Bulk results will appear here as each lead finishes.',attrs:{colspan:'6'}});row.append(td);tbody.append(row);}table.append(tbody);results.append(head,el('div',{className:'results-wrap'},[table]));wrap.append(status,results);return wrap;
}
function metric(label,value){return el('div',{className:'bulk-metric'},[el('strong',{text:value}),el('span',{text:label})]);}
async function startBulkUpload(file){
  if(!file)return;state.view='bulk';window.__bulkState={status:'uploading',filename:file.name,total:0,current:0,completed:0,failed:0,progress:0,message:'Reading file…',recent_results:[]};renderMain();
  try{const res=await fetch(`/api/v1/bulk/jobs?filename=${encodeURIComponent(file.name)}`,{method:'POST',headers:{'Content-Type':'application/octet-stream'},body:file});const d=await res.json();if(!res.ok)throw new Error(d.detail||`HTTP ${res.status}`);state.bulkJobId=d.job_id;window.__bulkState={...window.__bulkState,status:'queued',total:d.total,message:`Queued ${d.total} leads`};renderMain();startBulkPolling();toast(`Bulk job queued: ${d.total} leads.`,'success');}catch(err){window.__bulkState={...window.__bulkState,status:'error',message:err.message||String(err)};renderMain();toast(`Bulk upload failed: ${err.message||err}`,'error');}
}
function startBulkPolling(){if(state.bulkTimer)clearInterval(state.bulkTimer);const poll=async()=>{if(!state.bulkJobId)return;try{const res=await fetch(`/api/v1/bulk/jobs/${state.bulkJobId}`,{cache:'no-store'});const d=await res.json();if(!res.ok)throw new Error(d.detail||`HTTP ${res.status}`);window.__bulkState=d;if(state.view==='bulk')renderMain();if(['completed','completed_with_errors','cancelled'].includes(d.status)){clearInterval(state.bulkTimer);state.bulkTimer=null;toast(d.message,d.failed?'':'success');}}catch(err){toast(`Bulk status unavailable: ${err.message||err}`,'error');}};poll();state.bulkTimer=setInterval(poll,1200);}
async function cancelBulk(){if(!state.bulkJobId)return;try{const res=await fetch(`/api/v1/bulk/jobs/${state.bulkJobId}`,{method:'DELETE'});if(!res.ok)throw new Error(`HTTP ${res.status}`);toast('Bulk cancellation requested.');}catch(err){toast(`Cancel failed: ${err.message||err}`,'error');}}
async function downloadBulk(format){if(!state.bulkJobId)return;try{const res=await fetch(`/api/v1/bulk/jobs/${state.bulkJobId}/export?format=${format}`);const d=res.ok?null:await res.json();if(!res.ok)throw new Error(d&&d.detail||`HTTP ${res.status}`);downloadBlob(await res.blob(),filenameFromDisposition(res.headers.get('Content-Disposition'))||`bulk.${format}`);}catch(err){toast(`Bulk export failed: ${err.message||err}`,'error');}}

function csvEscape(value){let s=String(value??'');const trimmed=s.replace(/^[\s\t\r\n]+/,'');if(['=','+','-','@'].includes(trimmed[0]))s="'"+s;return `"${s.replace(/"/g,'""')}"`;}
function currentExportRows(){if(!state.dossier)return[];const d=state.dossier,e=d.entity||{},people=d.people||[];if(!people.length)return[{company:e.name||'',state:e.state||'',person:'',role:'',phones:(e.phones||[]).map(x=>x.number).join('; '),emails:(e.emails||[]).map(x=>x.email).join('; '),addresses:(e.addresses||[]).map(x=>x.address).join('; ')}];return people.map(p=>({company:e.name||'',state:e.state||'',person:p.name||'',role:p.role||(p.roles||[]).join('; '),phones:(p.direct_phones||[]).map(x=>x.number).join('; '),emails:(p.direct_emails||[]).map(x=>x.email).join('; '),addresses:(p.associated_addresses||[]).map(x=>x.address).join('; '),relationships:(p.relatives_and_associates||[]).map(x=>`${x.name} (${x.relationship})`).join('; '),sources:(p.evidence_sources||[]).map(x=>x.label).join('; ')}));}
function exportCurrentCsv(){const rows=currentExportRows();if(!rows.length){toast('No dossier to export.','error');return;}const headers=[...new Set(rows.flatMap(r=>Object.keys(r)))];const csv=[headers.map(csvEscape).join(','),...rows.map(r=>headers.map(h=>csvEscape(r[h]||'')).join(','))].join('\r\n');downloadBlob(new Blob(['\ufeff',csv],{type:'text/csv;charset=utf-8'}),`${safeFilename(state.dossier.entity&&state.dossier.entity.name||'dossier')}.csv`);}
function exportCurrentJson(){if(!state.dossier){toast('No dossier to export.','error');return;}downloadBlob(new Blob([JSON.stringify(state.dossier,null,2)],{type:'application/json'}),`${safeFilename(state.dossier.entity&&state.dossier.entity.name||'dossier')}.json`);}
function exportVcard(p,e){const phones=(p.direct_phones||[]).map(x=>`TEL;TYPE=CELL:${x.e164||x.number}`).join('\r\n');const emails=(p.direct_emails||[]).map(x=>`EMAIL:${x.email}`).join('\r\n');const addr=(p.associated_addresses||[])[0];const card=['BEGIN:VCARD','VERSION:3.0',`FN:${vcardSafe(p.name||'')}`,`ORG:${vcardSafe(e.name||'')}`,`TITLE:${vcardSafe(p.role||(p.roles||[]).join(', '))}`,phones,emails,addr?`ADR;TYPE=HOME:;;${vcardSafe(addr.address||'')}`:'','END:VCARD'].filter(Boolean).join('\r\n');downloadBlob(new Blob([card],{type:'text/vcard'}),`${safeFilename(p.name||'contact')}.vcf`);}
function vcardSafe(s){return String(s||'').replace(/[\\,;]/g,m=>`\\${m}`).replace(/\n/g,'\\n');}
function safeFilename(s){return String(s||'export').replace(/[^a-z0-9._-]+/gi,'-').replace(/^-+|-+$/g,'').slice(0,80)||'export';}
function downloadBlob(blob,filename){const url=URL.createObjectURL(blob);const a=el('a',{attrs:{href:url,download:filename}});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),0);}
function filenameFromDisposition(value){const m=String(value||'').match(/filename="?([^";]+)"?/i);return m?m[1]:'';}

window.addEventListener('beforeinstallprompt',event=>{event.preventDefault();state.installPrompt=event;const btn=document.getElementById('installBtn');if(btn)btn.hidden=false;});
window.addEventListener('appinstalled',()=>{state.installPrompt=null;toast('PWA installed.','success');});
window.addEventListener('beforeunload',()=>{if(state.eventSource)state.eventSource.close();if(state.bulkTimer)clearInterval(state.bulkTimer);});

buildShell();
