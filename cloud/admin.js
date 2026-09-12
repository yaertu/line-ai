const $ = (selector) => document.querySelector(selector);
const state = { data: null };
const money = (micros = 0) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'USD', maximumFractionDigits: 2 }).format(Number(micros) / 1_000_000);
const number = (value = 0) => new Intl.NumberFormat('tr-TR', { maximumFractionDigits: 0 }).format(Number(value));
const date = (value) => value ? new Intl.DateTimeFormat('tr-TR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)) : '—';
const clear = (element) => element.replaceChildren();
const text = (tag, value, className) => { const node = document.createElement(tag); node.textContent = String(value ?? '—'); if (className) node.className = className; return node; };
const button = (label, action, value, className = 'secondary') => { const node = text('button', label, className); node.type = 'button'; node.dataset.action = action; node.dataset.id = value; return node; };

async function request(action, body = {}) {
  const response = await fetch('/api/admin', { method: 'POST', credentials: 'same-origin', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ action, ...body }) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'İşlem tamamlanamadı.');
  return data;
}
async function load() {
  $('#status-line').textContent = 'Güncel kullanım ve yapılandırma okunuyor…';
  const response = await fetch('/api/admin', { credentials: 'same-origin', headers: { accept: 'application/json' } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'Yönetim verisi okunamadı.');
  state.data = data; render(data);
}
function showApp() { $('#login-view').classList.add('hidden'); $('#app-view').classList.remove('hidden'); }
function showLogin(message = '') { $('#app-view').classList.add('hidden'); $('#login-view').classList.remove('hidden'); $('#login-message').textContent = message; }
function projectName(id) { return state.data?.projects?.find((project) => project.id === id)?.name || 'Bilinmeyen proje'; }
function render(data) {
  showApp(); $('#role-label').textContent = data.role === 'owner' ? 'Sahip' : data.role === 'operator' ? 'Operatör' : 'Görüntüleyici';
  $('#engine-status').textContent = `Line AI metin ${data.engine.text ? 'hazır' : 'kapalı'} · Görsel ${data.engine.images ? 'hazır' : 'kapalı'}`;
  $('#status-line').textContent = `${data.projects.length} proje · ${data.requests.length} son istek · veriler sunucudan canlı okunur`;
  renderMetrics(data); renderProjects(data); renderKeys(data); renderPolicies(data); renderActivity(data); renderProjectOptions(data);
}
function renderMetrics(data) {
  const totals = data.totals.reduce((sum, item) => ({ units: sum.units + item.monthly, images: sum.images + item.monthlyImages, cost: sum.cost + item.monthlyCostMicros, requests: sum.requests + item.requests }), { units: 0, images: 0, cost: 0, requests: 0 });
  const items = [['Aylık birim', number(totals.units)], ['Aylık görsel', number(totals.images)], ['Tahmini aylık liste maliyeti', money(totals.cost)], ['İstek kaydı', number(totals.requests)]];
  const target = $('#metrics'); clear(target); for (const [label, value] of items) { const card = document.createElement('article'); card.className = 'metric'; card.append(text('span', label), text('strong', value)); target.append(card); }
}
function renderProjectOptions(data) {
  for (const selector of ['#key-project', '#automation-project']) { const select = $(selector); const prior = select.value; clear(select); data.projects.forEach((project) => { const option = text('option', project.name); option.value = project.id; select.append(option); }); if ([...select.options].some((option) => option.value === prior)) select.value = prior; }
  const automation = data.automation; $('#automation-toggle').checked = Boolean(automation?.enabled); if (automation?.project_id) $('#automation-project').value = automation.project_id;
  const automationState = automation?.enabled ? 'Etkin: test maliyeti seçili projeye yazılır; iyileştirme politikası tüm projeler içindir.' : 'Kapalı: hiçbir değerlendirme veya öneri kendiliğinden başlatılmaz.';
  const automationRun = automation?.last_status ? `Son durum: ${automation.last_status}${automation.last_completed ? ` · ${date(automation.last_completed)}` : ''}` : 'Henüz otomatik çalışma yok.';
  $('#automation-note').textContent = `${automationState} ${automationRun}`;
}
function renderProjects(data) {
  const list = $('#projects-list'); clear(list);
  data.projects.forEach((project) => {
    const card = document.createElement('article'); card.className = 'project-card'; const header = document.createElement('header'); const title = document.createElement('div'); title.append(text('h3', project.name), text('p', `${project.enabled ? 'Etkin' : 'Duraklatıldı'} · Görsel ${project.images_enabled ? 'açık' : 'kapalı'}`)); header.append(title, button('Kaydet', 'save-project', project.id)); card.append(header);
    const limits = document.createElement('div'); limits.className = 'limits';
    const fields = [['daily_units', 'Günlük birim'], ['monthly_units', 'Aylık birim'], ['daily_images', 'Günlük görsel'], ['monthly_images', 'Aylık görsel'], ['daily_cost_micros', 'Günlük maliyet üst sınırı · $'], ['monthly_cost_micros', 'Aylık maliyet üst sınırı · $'], ['rpm', 'Dakika başı istek'], ['concurrency', 'Eşzamanlı iş']];
    fields.forEach(([key, label]) => { const wrap = document.createElement('label'); wrap.textContent = label; const input = document.createElement('input'); input.type = 'number'; input.min = '0'; input.step = key.includes('cost') ? '0.01' : '1'; input.value = key.includes('cost') ? String(Number(project[key]) / 1_000_000) : String(project[key]); input.dataset.field = key; wrap.append(input); limits.append(wrap); });
    const flags = document.createElement('label'); flags.textContent = 'Durum'; const enabled = document.createElement('input'); enabled.type = 'checkbox'; enabled.checked = project.enabled; enabled.dataset.field = 'enabled'; flags.append(enabled); flags.append(document.createTextNode(' Etkin')); const images = document.createElement('input'); images.type = 'checkbox'; images.checked = project.images_enabled; images.dataset.field = 'images_enabled'; flags.append(images); flags.append(document.createTextNode(' Görsel')); limits.append(flags); card.append(limits); list.append(card);
  });
}
function renderKeys(data) { const list = $('#keys-list'); clear(list); data.keys.forEach((key) => { const row = document.createElement('tr'); row.append(text('td', key.name), text('td', projectName(key.project_id)), text('td', key.scopes.join(', ')), text('td', date(key.expires_at)), text('td', key.revoked_at ? 'İptal' : 'Etkin', key.revoked_at ? 'tag bad' : 'tag good')); const actions = document.createElement('td'); if (!key.revoked_at) actions.append(button('İptal et', 'revoke-key', key.id)); row.append(actions); list.append(row); }); }
function renderPolicies(data) {
 const list=$('#policies-list');clear(list);
 const labels={draft:'Taslak',tested:'Testleri geçti',published:'Yayında',retired:'Önceki sürüm'};
 data.policies.forEach(policy=>{
  const card=text('article','','policy-card'),header=document.createElement('header'),title=document.createElement('div'),actions=text('div','','button-row');
  title.append(text('h3','v'+policy.version),text('p',(labels[policy.status]||policy.status)+' · '+date(policy.created_at)));
  if(policy.status==='draft')actions.append(button('Değerlendir','evaluate-policy',policy.id));
  if(['tested','retired'].includes(policy.status)&&policy.evaluation?.passed)actions.append(button(policy.status==='retired'?'Bu sürüme dön':'Yayınla','publish-policy',policy.id,'primary'));
  header.append(title,actions);card.append(header,text('p',policy.instructions));
  const evaluation=policy.evaluation;
  if(evaluation){
   card.append(text('p','Test sonucu: '+evaluation.score+'/'+evaluation.total+' · '+(evaluation.passed?'Geçti':'Yayınlanmadı')+' · '+date(evaluation.testedAt)));
   if(evaluation.cases?.length){
    const details=document.createElement('details');details.append(text('summary','Test ayrıntılarını gör'));
    for(const item of evaluation.cases){const row=document.createElement('details');row.append(text('summary',item.id+' · Temel: '+(item.baselinePassed?'geçti':'kaldı')+' · Yeni: '+(item.candidatePassed?'geçti':'kaldı')),text('pre',item.candidateAnswer));details.append(row);}
    card.append(details);
   }
  }
  list.append(card);
 });
}
function displayModel(model, kind) { return String(model || '').startsWith('line-ai-') ? model : kind === 'image' ? 'line-ai-vision-v1' : 'line-ai-neural-v1'; }
function renderActivity(data) { const list = $('#requests-list'); clear(list); data.requests.forEach((item) => { const row = document.createElement('tr'); row.append(text('td', date(item.created_at)), text('td', item.kind), text('td', displayModel(item.model, item.kind)), text('td', item.status, item.status === 'completed' ? 'tag good' : 'tag'), text('td', number(item.units)), text('td', `${money(item.cost_micros)} · tahmini liste fiyatı`)); list.append(row); }); const logs = $('#logs-list'); clear(logs); data.logs.forEach((log) => logs.append(text('li', `${date(log.created_at)} · ${log.action}${log.target ? ` · ${log.target}` : ''}`))); }
function activeProjectId() { return $('#key-project').value || state.data?.projects?.[0]?.id; }
function dialog(id) { $(id).showModal(); }
function formMessage(form, message) { const notice = form.querySelector('.notice'); if (notice) notice.textContent = message; else $('#status-line').textContent = message; }
async function afterAction(message = '') { await load(); $('#status-line').textContent = message || $('#status-line').textContent; }

$('#login-form').addEventListener('submit', async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); $('#login-message').textContent = 'Giriş doğrulanıyor…'; try { await request('login', { email: form.get('email'), password: form.get('password') }); formElement.reset(); await load(); } catch (error) { $('#login-message').textContent = error.message; } });
$('#refresh').addEventListener('click', () => load().catch((error) => { $('#status-line').textContent = error.message; }));
$('#logout').addEventListener('click', async () => { try { await request('logout'); showLogin('Oturum kapatıldı.'); } catch (error) { $('#status-line').textContent = error.message; } });
document.addEventListener('click', async (event) => { const target = event.target.closest('[data-open],[data-action],[data-close]'); if (!target) return; if (target.dataset.close) { $(`#${target.dataset.close}`).close(); return; } if (target.dataset.open) { if (target.dataset.open === 'key-dialog') $('#key-project').value = activeProjectId(); dialog(`#${target.dataset.open}`); return; } const busyAction = target.dataset.action === 'evaluate-policy'; if (busyAction) target.disabled = true; try { if (target.dataset.action === 'revoke-key') { if (!confirm('Bu anahtar iptal edilecek. Devam edilsin mi?')) return; await request('revoke_key', { id: target.dataset.id }); await afterAction('Anahtar iptal edildi.'); } if (target.dataset.action === 'save-project') { const card = target.closest('.project-card'); const fields = { id: target.dataset.id }; card.querySelectorAll('[data-field]').forEach((input) => { fields[input.dataset.field] = input.type === 'checkbox' ? input.checked : input.dataset.field.includes('cost') ? Math.round(Number(input.value) * 1_000_000) : Number(input.value); }); await request('update_project', fields); await afterAction('Proje limitleri kaydedildi.'); } if (target.dataset.action === 'evaluate-policy') { await request('evaluate', { id: target.dataset.id, projectId: activeProjectId() }); await afterAction('Altı vakalık regresyon değerlendirmesi tamamlandı.'); } if (target.dataset.action === 'publish-policy') { if (!confirm('Bu değerlendirilmiş sürüm yayınlansın mı?')) return; await request('publish_policy', { id: target.dataset.id }); await afterAction('Politika yayınlandı.'); } } catch (error) { $('#status-line').textContent = error.message; } finally { if (busyAction) target.disabled = false; } });
$('#project-form').addEventListener('submit', async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { await request('create_project', { name: form.get('name') }); formElement.reset(); $('#project-dialog').close(); await afterAction('Proje oluşturuldu.'); } catch (error) { formMessage(formElement, error.message); } });
$('#key-form').addEventListener('submit', async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { const result = await request('create_key', { name: form.get('name'), projectId: form.get('projectId'), days: Number(form.get('days')), scopes: form.getAll('scopes') }); formElement.reset(); $('#key-dialog').close(); $('#secret-value').textContent = result.secret; $('#secret-message').textContent = ''; dialog('#secret-dialog'); await load(); } catch (error) { formMessage(formElement, error.message); } });
$('#policy-form').addEventListener('submit', async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { await request('create_policy', { version: form.get('version'), instructions: form.get('instructions') }); formElement.reset(); $('#policy-dialog').close(); await afterAction('Politika taslağı oluşturuldu.'); } catch (error) { formMessage(formElement, error.message); } });
$('#improve-policy').addEventListener('click', async (event) => { const control = event.currentTarget; control.disabled = true; try { await request('improve', { projectId: activeProjectId() }); await afterAction('İyileştirme taslağı oluşturuldu; yayın için değerlendirme gerekir.'); } catch (error) { $('#status-line').textContent = error.message; } finally { control.disabled = false; } });
$('#automation-toggle').addEventListener('change', async (event) => { const toggle = event.currentTarget; const enabled = toggle.checked; toggle.disabled = true; try { await request('automation', { enabled, projectId: $('#automation-project').value }); await afterAction('Otomasyon tercihi güncellendi.'); } catch (error) { toggle.checked = !enabled; $('#automation-note').textContent = error.message; } finally { toggle.disabled = false; } });
$('#automation-project').addEventListener('change', () => { if ($('#automation-toggle').checked) $('#automation-toggle').dispatchEvent(new Event('change')); });
$('#password-form').addEventListener('submit', async (event) => { event.preventDefault(); const formElement = event.currentTarget; const form = new FormData(formElement); try { await request('password', { password: form.get('password') }); formElement.reset(); showLogin('Parola güncellendi. Yeniden giriş yapın.'); } catch (error) { formMessage(formElement, error.message); } });
$('#copy-secret').addEventListener('click', async () => { try { await navigator.clipboard.writeText($('#secret-value').textContent); $('#secret-message').textContent = 'Panoya kopyalandı. Anahtarı güvenli bir yere kaydedin.'; } catch { $('#secret-message').textContent = 'Pano erişimi yok. Anahtarı elle güvenli yere kaydedin.'; } });
$('#secret-close').addEventListener('click', () => { $('#secret-value').textContent = ''; $('#secret-dialog').close(); });
$('#secret-dialog').addEventListener('close', () => { $('#secret-value').textContent = ''; $('#secret-message').textContent = ''; });
document.querySelectorAll('.tabs button').forEach((tab) => tab.addEventListener('click', () => { document.querySelectorAll('.tabs button').forEach((item) => item.classList.toggle('active', item === tab)); document.querySelectorAll('.panel').forEach((panel) => panel.classList.toggle('active', panel.dataset.panel === tab.dataset.tab)); }));
load().catch(() => showLogin());
