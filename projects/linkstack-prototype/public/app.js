const STORAGE_KEY = 'linkstack:local-data';
const root = document.querySelector('#root');
const toast = document.querySelector('[data-toast]');
const themes = {
  paper: { bg:'#fdf9f4', surface:'#fffdfa', text:'#3d3840', muted:'#777079', border:'#e5ded8' },
  midnight: { bg:'#171520', surface:'#282238', text:'#faf7ff', muted:'#b9b1c8', border:'#4b4260' },
  sunset: { bg:'#fff0df', surface:'#fffaf3', text:'#4b2d22', muted:'#9b7667', border:'#edd3bd' },
  mint: { bg:'#eaf6f1', surface:'#fbfffd', text:'#24433e', muted:'#6b8d85', border:'#c8e4da' },
};
const defaults = {
  schemaVersion: 2,
  profile: {
    name:'יאיר אהרון כהן',
    bio:'🌀 מים\n💧 נשימה\n🧘🏻‍♀️ תודעה\n🌀\nקורסים דיגיטליים סדנאות ותהליכי ריפוי',
    slug:'aharonyaircohen',
    initials:'יא',
    image:'https://ugc.production.linktr.ee/b297ddc9-6e86-4e0c-8886-60fc24666f92_photo-5971945446207243715-y.jpeg',
  },
  links: [
    { id:'yama-course', title:'בניית מערכת ימה - Digital Reality', url:'https://thedigitalreality.net/courses/building-yama/', thumbnail:'https://ugc.production.linktr.ee/a40a0ea7-ef3f-4de4-9270-17a778fd9a3b_Copy-of-Water-Template-1-1-1024x576.jpeg', enabled:true },
    { id:'yama-support', title:'בניית מערכת ימה - קבוצת תמיכה', url:'https://chat.whatsapp.com/IbKcp5EnnR25qI4h3IkRTr', thumbnail:'https://ugc.production.linktr.ee/b9ba35ca-2f39-4e67-94c3-9e68926b88ae_image.png', enabled:true },
    { id:'chronic-dehydration', title:'מהי התייבשות כרונית – קורס דיגיטלי', url:'https://thedigitalreality.net/courses/chronic-dehydration/', thumbnail:'https://ugc.production.linktr.ee/6e4e3aac-b758-4bc6-b75e-2478885b631f_Add-a-heading.jpeg', enabled:true },
    { id:'digital-reality', title:'מערכת המציאות הדיגיטלית', url:'https://thedigitalreality.net/', thumbnail:'https://ugc.production.linktr.ee/a22f374b-ea64-4244-b549-983ad271e54d_image.png', enabled:true },
    { id:'growth-circles', title:'מעגלי צמיחה - סדנאות', url:'https://chat.whatsapp.com/F1vtwpZK33Z3ZZc3bA03Ie', enabled:true },
    { id:'questions', title:'לכל שאלה נוספת שלח.י הודעה', url:'https://wa.me/+972502171468', thumbnail:'https://ugc.production.linktr.ee/a12ed552-b366-4082-aabb-10a4b0880d23_image.png', enabled:true },
  ],
  socials: [
    { id:'instagram', title:'Instagram', url:'https://instagram.com/aharonyaircoh' },
    { id:'facebook', title:'Facebook', url:'https://www.facebook.com/profile.php?id=100069604805109' },
    { id:'email', title:'Email', url:'mailto:aharon.yair.cohen@gmail.com' },
  ],
  appearance: { theme:'paper', accent:'#e77b5e', buttonStyle:'rounded', font:'sans', spacing:'comfortable' },
};
let data = loadData();
let editorOpen = false;
let editingId = null;
let toastTimer;

function clone(value) { return JSON.parse(JSON.stringify(value)); }
function loadData() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    if (!saved || saved.schemaVersion !== defaults.schemaVersion) return clone(defaults);
    return { ...clone(defaults), ...saved, profile:{ ...defaults.profile, ...saved.profile }, appearance:{ ...defaults.appearance, ...saved.appearance }, links:Array.isArray(saved.links) ? saved.links : clone(defaults.links), socials:Array.isArray(saved.socials) ? saved.socials : clone(defaults.socials) };
  } catch { return clone(defaults); }
}
function showToast(message) { toast.textContent = message; toast.classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => toast.classList.remove('visible'), 2200); }
function saveData(message = 'Saved locally') { localStorage.setItem(STORAGE_KEY, JSON.stringify(data)); render(); showToast(message); }
function esc(value = '') { return String(value).replace(/[&<>'"]/g, (char) => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', "'":'&#39;', '"':'&quot;' })[char]); }
function normalizeUrl(value) { const trimmed = value.trim(); return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`; }
function initials(name) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]).join('').toUpperCase() || 'LS'; }
function appearanceVars() {
  const theme = themes[data.appearance.theme] || themes.paper;
  const fonts = { sans:'Inter,ui-sans-serif,system-ui,sans-serif', serif:'Georgia,serif', mono:'ui-monospace,SFMono-Regular,monospace' };
  const radii = { rounded:'10px', square:'3px', pill:'28px' };
  return `--profile-bg:${theme.bg};--profile-surface:${theme.surface};--profile-text:${theme.text};--profile-muted:${theme.muted};--profile-border:${theme.border};--profile-accent:${data.appearance.accent};--profile-font:${fonts[data.appearance.font] || fonts.sans};--profile-radius:${radii[data.appearance.buttonStyle] || radii.rounded};`;
}
function profileCard() {
  const links = data.links.filter((link) => link.enabled);
  const spacing = data.appearance.spacing === 'compact' ? ' compact' : '';
  const body = links.length ? links.map((link) => `<a class="profile-link" href="${esc(normalizeUrl(link.url))}" target="_blank" rel="noreferrer"><span class="profile-link-content">${link.thumbnail ? `<img class="link-thumb" src="${esc(link.thumbnail)}" alt="" loading="lazy" />` : ''}<span>${esc(link.title)}</span></span><b>↗</b></a>`).join('') : '<div class="empty">No active links yet.</div>';
  const socials = data.socials?.length ? `<div class="social-links">${data.socials.map((social) => `<a href="${esc(social.url)}" target="_blank" rel="noreferrer" aria-label="${esc(social.title)}">${social.title === 'Instagram' ? '◎' : social.title === 'Facebook' ? 'f' : '✉'}</a>`).join('')}</div>` : '';
  const avatar = data.profile.image ? `<img class="profile-avatar" src="${esc(data.profile.image)}" alt="${esc(data.profile.name)}" />` : `<div class="avatar">${esc(data.profile.initials)}</div>`;
  return `<div class="public-profile">${avatar}<strong>${esc(data.profile.name)}</strong><span>${esc(data.profile.bio).replace(/\n/g, '<br />')}</span><small>@${esc(data.profile.slug)}</small></div><div class="profile-links${spacing}">${body}</div>${socials}<div class="profile-footer"><span class="brand-mark"><i></i><i></i><i></i></span>Made with LinkStack</div>`;
}
function linkEditor() {
  if (!editorOpen) return '';
  const link = data.links.find((item) => item.id === editingId);
  return `<div class="editor"><h3>${link ? 'Edit link' : 'Add link'}</h3><form class="form" data-form="link"><label class="field">Title<input name="title" required maxlength="80" value="${esc(link?.title || '')}" placeholder="My website" /></label><label class="field">URL<input name="url" required value="${esc(link?.url || '')}" placeholder="https://example.com" /></label><label class="field">Thumbnail URL<input name="thumbnail" value="${esc(link?.thumbnail || '')}" placeholder="Optional image URL" /></label><label class="switch-line"><span>Show this link on my page</span><input name="enabled" type="checkbox" ${link?.enabled !== false ? 'checked' : ''} /></label><div class="form-actions"><button class="button button-light button-small" type="button" data-action="cancel-link">Cancel</button><button class="button button-primary button-small" type="submit">Save link</button></div></form></div>`;
}
function preview() {
  const desktop = document.body.classList.contains('preview-desktop');
  return `<div class="preview-head"><h2>Live preview <span class="live"><span class="dot"></span>Live</span></h2><div class="device-toggle"><button class="${desktop ? '' : 'active'}" data-action="mobile-preview" aria-label="Mobile preview">▯</button><button class="${desktop ? 'active' : ''}" data-action="desktop-preview" aria-label="Desktop preview">▭</button></div></div><div class="stage"><div class="phone"><div class="screen" style="${appearanceVars()}"><div class="phone-time"><span>9:41</span><span>▮▮▮ ◇</span></div>${profileCard()}</div></div></div><p class="preview-note">Saved in this browser. <a href="/p/${esc(data.profile.slug)}" target="_blank" rel="noreferrer">Open public page ↗</a></p>`;
}
function appearanceControls() {
  const a = data.appearance;
  return `<div class="appearance-grid"><div><span class="option-label">Theme</span><div class="theme-picker"><button class="theme-card ${a.theme === 'paper' ? 'active' : ''}" data-action="theme" data-theme="paper"><span class="theme-preview paper-theme"><i></i><b></b><em></em></span><strong>Paper</strong></button><button class="theme-card ${a.theme === 'midnight' ? 'active' : ''}" data-action="theme" data-theme="midnight"><span class="theme-preview midnight-theme"><i></i><b></b><em></em></span><strong>Midnight</strong></button><button class="theme-card ${a.theme === 'sunset' ? 'active' : ''}" data-action="theme" data-theme="sunset"><span class="theme-preview sunset-theme"><i></i><b></b><em></em></span><strong>Sunset</strong></button><button class="theme-card ${a.theme === 'mint' ? 'active' : ''}" data-action="theme" data-theme="mint"><span class="theme-preview mint-theme"><i></i><b></b><em></em></span><strong>Mint</strong></button></div></div><div class="appearance-controls"><div><span class="option-label">Accent color</span><div class="color-picker"><button class="color-swatch ${a.accent === '#e77b5e' ? 'active' : ''}" style="--swatch:#e77b5e" aria-label="Coral accent" data-action="accent" data-color="#e77b5e"></button><button class="color-swatch ${a.accent === '#6d58d9' ? 'active' : ''}" style="--swatch:#6d58d9" aria-label="Purple accent" data-action="accent" data-color="#6d58d9"></button><button class="color-swatch ${a.accent === '#2b9c8c' ? 'active' : ''}" style="--swatch:#2b9c8c" aria-label="Teal accent" data-action="accent" data-color="#2b9c8c"></button><button class="color-swatch ${a.accent === '#e1a24d' ? 'active' : ''}" style="--swatch:#e1a24d" aria-label="Gold accent" data-action="accent" data-color="#e1a24d"></button></div></div><div><span class="option-label">Typography</span><div class="choice-row"><button class="choice-button ${a.font === 'sans' ? 'active' : ''}" data-action="font" data-font="sans">Sans</button><button class="choice-button serif ${a.font === 'serif' ? 'active' : ''}" data-action="font" data-font="serif">Serif</button><button class="choice-button mono ${a.font === 'mono' ? 'active' : ''}" data-action="font" data-font="mono">Mono</button></div></div><div><span class="option-label">Buttons</span><div class="style-options"><button class="style-choice ${a.buttonStyle === 'rounded' ? 'active' : ''}" aria-label="Rounded button style" data-action="button-style" data-button-style="rounded"><span></span></button><button class="style-choice square ${a.buttonStyle === 'square' ? 'active' : ''}" aria-label="Square button style" data-action="button-style" data-button-style="square"><span></span></button><button class="style-choice pill ${a.buttonStyle === 'pill' ? 'active' : ''}" aria-label="Pill button style" data-action="button-style" data-button-style="pill"><span></span></button></div></div><div><span class="option-label">Link spacing</span><div class="choice-row"><button class="choice-button ${a.spacing === 'comfortable' ? 'active' : ''}" data-action="spacing" data-spacing="comfortable">Comfy</button><button class="choice-button ${a.spacing === 'compact' ? 'active' : ''}" data-action="spacing" data-spacing="compact">Compact</button></div></div></div></div>`;
}
function builder() {
  const links = data.links.map((link, index) => `<article class="link-row ${link.enabled ? '' : 'disabled'}"><div class="link-main">${link.thumbnail ? `<img class="link-row-thumb" src="${esc(link.thumbnail)}" alt="" loading="lazy" />` : '<div class="link-icon">↗</div>'}<div class="link-copy"><strong>${esc(link.title)}</strong><span>${esc(link.url)}</span></div></div><div class="row-actions"><button type="button" aria-label="Move ${esc(link.title)} up" data-action="move-up" data-id="${link.id}" ${index === 0 ? 'disabled' : ''}>↑</button><button type="button" aria-label="Move ${esc(link.title)} down" data-action="move-down" data-id="${link.id}" ${index === data.links.length - 1 ? 'disabled' : ''}>↓</button><button type="button" aria-label="Toggle ${esc(link.title)}" data-action="toggle-link" data-id="${link.id}">${link.enabled ? '◉' : '○'}</button><button type="button" aria-label="Edit ${esc(link.title)}" data-action="edit-link" data-id="${link.id}">✎</button><button class="danger" type="button" aria-label="Delete ${esc(link.title)}" data-action="delete-link" data-id="${link.id}">×</button></div></article>`).join('');
  return `<div class="app-shell"><aside class="sidebar"><a class="brand" href="/"><span class="brand-mark"><i></i><i></i><i></i></span>linkstack</a><div class="workspace"><div class="avatar">${esc(data.profile.initials)}</div><div class="workspace-copy"><strong>${esc(data.profile.name)}'s page</strong><small>Local workspace</small></div></div><nav class="nav"><a class="active" href="#builder"><span class="nav-icon">▣</span>Builder</a><a href="#profile"><span class="nav-icon">◎</span>Profile</a><a href="#appearance"><span class="nav-icon">✦</span>Appearance</a></nav><div class="sidebar-bottom"><div class="local-note"><strong>Local mode</strong>Your page is saved in this browser. No account or server is required.</div><div class="account"><div class="avatar">${esc(data.profile.initials.slice(0, 1))}</div><div><strong>${esc(data.profile.name)}</strong><small>Local profile</small></div></div></div></aside><main class="main"><header class="topbar"><div class="crumbs"><span>LinkStack</span><b>/</b><strong>Builder</strong></div><div class="top-actions"><span class="save-state" data-save-state><span class="dot"></span>Saved locally</span><a class="button button-light" href="/p/${esc(data.profile.slug)}" target="_blank" rel="noreferrer">View page ↗</a><button class="button button-dark" data-action="share">Copy public link</button></div></header><div class="page"><div class="page-head"><div><p class="eyebrow">LOCAL LINK PAGE</p><h1>Build your link page</h1><p class="subhead">Add links, shape your profile, and share one simple URL.</p></div></div><div class="builder"><div class="column"><section class="panel" id="profile"><div class="panel-head"><div><h2>Profile</h2><p class="panel-copy">This is the identity people see at the top of your page.</p></div></div><form class="form" data-form="profile"><label class="field">Display name<input name="name" required maxlength="60" value="${esc(data.profile.name)}" /></label><label class="field">Bio<textarea name="bio" maxlength="140">${esc(data.profile.bio)}</textarea></label><label class="field">Profile image URL<input name="image" type="url" value="${esc(data.profile.image || '')}" placeholder="https://..." /></label><label class="field">Public URL<input name="slug" required pattern="(?:[a-z]|[0-9]|-)+" value="${esc(data.profile.slug)}" /><small>Local page: /p/${esc(data.profile.slug)}</small></label><div class="form-actions"><button class="button button-primary button-small" type="submit">Save profile</button></div></form></section><section class="panel" id="builder"><div class="panel-head"><div><h2>Links</h2><p class="panel-copy">Add the destinations you want people to visit.</p></div><button class="button button-primary button-small" data-action="add-link">+ Add link</button></div><div class="section-head"><div><h3>Your links</h3><p>Use the arrows to change the order.</p></div></div><div class="link-list">${links || '<div class="empty">Add your first link to get started.</div>'}</div>${linkEditor()}</section><section class="panel" id="appearance"><div class="panel-head"><div><h2>Appearance</h2><p class="panel-copy">These settings change the public page preview.</p></div><button class="button button-light button-small" data-action="reset-appearance">Reset</button></div>${appearanceControls()}</section></div><aside class="preview-column"><div data-preview>${preview()}</div></aside></div></div></main></div>`;
}
function publicPage() { return `<main class="public-page" style="${appearanceVars()}"><a class="button button-outline back-builder" href="/">← Edit page</a><section class="public-card">${profileCard()}</section></main>`; }
function render() { root.innerHTML = location.pathname.startsWith('/p/') ? publicPage() : builder(); }
function rerender(message) { saveData(message); }

root.addEventListener('submit', (event) => {
  event.preventDefault();
  const form = event.target;
  if (form.dataset.form === 'profile') {
    const name = form.elements.name.value.trim();
    const slug = form.elements.slug.value.trim().toLowerCase().replace(/[^a-z0-9-]/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '') || 'my-page';
    data.profile = { ...data.profile, name, bio:form.elements.bio.value.trim(), image:form.elements.image.value.trim(), slug, initials:initials(name) };
    rerender('Profile saved locally');
  }
  if (form.dataset.form === 'link') {
    const next = { title:form.elements.title.value.trim(), url:normalizeUrl(form.elements.url.value), thumbnail:form.elements.thumbnail.value.trim(), enabled:form.elements.enabled.checked };
    if (editingId) data.links = data.links.map((link) => link.id === editingId ? { ...link, ...next } : link);
    else data.links.push({ id:crypto.randomUUID(), ...next });
    editorOpen = false; editingId = null; rerender('Link saved locally');
  }
});
root.addEventListener('click', async (event) => {
  const target = event.target.closest('[data-action]');
  if (!target) return;
  const action = target.dataset.action; const id = target.dataset.id;
  if (action === 'add-link') { editorOpen = true; editingId = null; render(); return; }
  if (action === 'cancel-link') { editorOpen = false; editingId = null; render(); return; }
  if (action === 'edit-link') { editorOpen = true; editingId = id; render(); return; }
  if (action === 'delete-link') { data.links = data.links.filter((link) => link.id !== id); rerender('Link deleted'); return; }
  if (action === 'toggle-link') { data.links = data.links.map((link) => link.id === id ? { ...link, enabled:!link.enabled } : link); rerender('Link visibility updated'); return; }
  if (action === 'move-up' || action === 'move-down') { const index = data.links.findIndex((link) => link.id === id); const next = action === 'move-up' ? index - 1 : index + 1; if (index >= 0 && next >= 0 && next < data.links.length) [data.links[index], data.links[next]] = [data.links[next], data.links[index]]; rerender('Link order saved'); return; }
  if (action === 'theme') { data.appearance.theme = target.dataset.theme; rerender(`${target.dataset.theme} theme applied`); return; }
  if (action === 'accent') { data.appearance.accent = target.dataset.color; rerender('Accent color saved'); return; }
  if (action === 'font') { data.appearance.font = target.dataset.font; rerender('Typography saved'); return; }
  if (action === 'button-style') { data.appearance.buttonStyle = target.dataset.buttonStyle; rerender('Button style saved'); return; }
  if (action === 'spacing') { data.appearance.spacing = target.dataset.spacing; rerender('Link spacing saved'); return; }
  if (action === 'reset-appearance') { data.appearance = clone(defaults.appearance); rerender('Appearance reset'); return; }
  if (action === 'share') { const url = `${location.origin}/p/${data.profile.slug}`; try { await navigator.clipboard.writeText(url); showToast('Public link copied'); } catch { showToast(url); } return; }
  if (action === 'mobile-preview' || action === 'desktop-preview') { document.body.classList.toggle('preview-desktop', action === 'desktop-preview'); render(); }
});
render();
