const modeButtons = document.querySelectorAll('.mode-button');
const loggedOutActions = document.querySelector('#loggedOutActions');
const loggedInActions = document.querySelector('#loggedInActions');
const loginButton = document.querySelector('#loginButton');
const signupButton = document.querySelector('#signupButton');
const historyButton = document.querySelector('#historyButton');
const historyModal = document.querySelector('#historyModal');
const historyList = document.querySelector('#historyList');
const historyDetailModal = document.querySelector('#historyDetailModal');
const historyDetailCopy = document.querySelector('#historyDetailCopy');
const historyDetailMessage = document.querySelector('#historyDetailMessage');
const badgeGrid = document.querySelector('#badgeGrid');
const badgeProgress = document.querySelector('#badgeProgress');
const badgeShareModal = document.querySelector('#badgeShareModal');
const badgeShareImage = document.querySelector('#badgeShareImage');
const badgeShareCopy = document.querySelector('#badgeShareCopy');
const nativeShareButton = document.querySelector('#nativeShareButton');
const savedMoney = document.querySelector('#savedMoney');
const savedCarbon = document.querySelector('#savedCarbon');
const monthlyAnalyses = document.querySelector('#monthlyAnalyses');
const aiRecommendedBought = document.querySelector('#aiRecommendedBought');
const aiFollowedAvoid = document.querySelector('#aiFollowedAvoid');
const aiIgnored = document.querySelector('#aiIgnored');
const guideRate = document.querySelector('#guideRate');
const guideCopy = document.querySelector('#guideCopy');
const purposeTotal = document.querySelector('#purposeTotal');
const purposeLegend = document.querySelector('#purposeLegend');
const carbonTrees = document.querySelector('#carbonTrees');
const carbonDetail = document.querySelector('#carbonDetail');
let purposeChart = null;
const accountEmail = document.querySelector('#accountEmail');
const badgeCount = document.querySelector('#badgeCount');
const logoutButton = document.querySelector('#logoutButton');
const form = document.querySelector('#analysisForm');
const loadingCard = document.querySelector('#loadingCard');
const resetButton = document.querySelector('#resetButton');
const analysisResult = document.querySelector('#analysisResult');
const authModal = document.querySelector('#authModal');
const savePrompt = document.querySelector('#savePrompt');
const authForm = document.querySelector('#authForm');
const authMessage = document.querySelector('#authMessage');
const authSubmit = document.querySelector('#authSubmit');
const profileSelect = document.querySelector('#profileSelect');
const privacyConsentField = document.querySelector('#privacyConsentField');
const privacyConsent = document.querySelector('#privacyConsent');
const authTitle = document.querySelector('#authTitle');
let supabaseClient = null;
let supabaseSetupMessage = 'Supabase 연결 상태를 확인하고 있어요.';
let supabaseReadyPromise = null;
let currentUser = null;
let authMode = 'login';
let pendingResult = null;
let pendingInput = null;
let pendingHistoryId = new URLSearchParams(window.location.search).get('history');
let currentReminderRecord = null;

const getValue = (name) => new FormData(form).get(name) || '';
const openModal = (modal) => { modal.hidden = false; document.body.classList.add('modal-open'); };
const closeModal = (modal) => { modal.hidden = true; if ([authModal, savePrompt].every((item) => item.hidden)) document.body.classList.remove('modal-open'); };

function setAuthMode(nextMode) {
  authMode = nextMode;
  document.querySelectorAll('.auth-tab').forEach((tab) => tab.classList.toggle('active', tab.dataset.authTab === nextMode));
  const signup = nextMode === 'signup';
  profileSelect.hidden = !signup;
  privacyConsentField.hidden = !signup;
  privacyConsent.required = signup;
  privacyConsent.checked = false;
  authSubmit.innerHTML = signup ? '회원가입하기 <span>→</span>' : '로그인하기 <span>→</span>';
  authTitle.innerHTML = signup ? '나에게 맞는 소비 습관을<br /><span>시작해요.</span>' : '내 소비 기록을<br /><span>안전하게 저장해요.</span>';
  authMessage.textContent = '';
}

function setBadgeCount(count) {
  badgeCount.textContent = `${count}개`;
  if (currentUser) localStorage.setItem(`greenchoice_badges_${currentUser.id}`, String(count));
}

function updateAccount(user) {
  currentUser = user;
  if (!user) {
    loggedOutActions.hidden = false;
    loggedInActions.hidden = true;
    return;
  }
  loggedOutActions.hidden = true;
  loggedInActions.hidden = false;
  accountEmail.textContent = user.email || '로그인 사용자';
  const savedBadges = Number(localStorage.getItem(`greenchoice_badges_${user.id}`) || 0);
  setBadgeCount(savedBadges);
}

async function initSupabase() {
  try {
    const response = await fetch('/api/config');
    if (!response.ok) throw new Error('설정 응답 오류');
    const config = await response.json();
    if (!config.supabaseUrl) { supabaseSetupMessage = 'Supabase 프로젝트 URL이 서버 설정에 없어요.'; return; }
    if (!config.supabaseAnonKey) { supabaseSetupMessage = 'Supabase 공개 API 키가 서버 설정에 없어요.'; return; }
    if (!window.supabase) { supabaseSetupMessage = 'Supabase 인증 라이브러리를 불러오지 못했어요.'; return; }
    const projectUrl = new URL(config.supabaseUrl);
    projectUrl.pathname = projectUrl.pathname.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') || '/';
    supabaseClient = window.supabase.createClient(projectUrl.toString().replace(/\/$/, ''), config.supabaseAnonKey);
    const { data } = await supabaseClient.auth.getSession();
    updateAccount(data.session?.user || null);
    supabaseClient.auth.onAuthStateChange(async (_event, session) => { updateAccount(session?.user || null); if (session?.user && pendingHistoryId) await openHistoryDetail(pendingHistoryId); });
    supabaseSetupMessage = '';
    if (pendingHistoryId) { if (data.session?.user) await openHistoryDetail(pendingHistoryId); else openAuth('login'); }
  } catch { supabaseSetupMessage = 'Supabase 연결 설정을 확인하지 못했어요. 프로젝트 URL과 공개 API 키를 확인해 주세요.'; }
}

function openAuth(nextMode = 'login') { setAuthMode(nextMode); openModal(authModal); setTimeout(() => document.querySelector('#authEmail').focus(), 0); }

modeButtons.forEach((button) => {
  button.addEventListener('click', () => {
    modeButtons.forEach((item) => item.classList.remove('active'));
    button.classList.add('active');
  });
});

loginButton.addEventListener('click', () => openAuth('login'));
signupButton.addEventListener('click', () => openAuth('signup'));
historyButton.addEventListener('click', async () => { openModal(historyModal); await renderHistory(); });

document.querySelectorAll('[data-auth-tab]').forEach((tab) => tab.addEventListener('click', () => setAuthMode(tab.dataset.authTab)));
document.querySelectorAll('[data-close-modal]').forEach((button) => button.addEventListener('click', () => closeModal(document.querySelector(`#${button.dataset.closeModal}`))));
document.querySelector('#showPrivacyPolicy').addEventListener('click', () => openModal(document.querySelector('#privacyModal')));

authForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  authSubmit.disabled = true;
  try {
    await supabaseReadyPromise;
    if (!supabaseClient) { authMessage.textContent = supabaseSetupMessage; return; }
    authMessage.textContent = authMode === 'signup' ? '계정을 만들고 있어요...' : '로그인하고 있어요...';
    const email = document.querySelector('#authEmail').value.trim();
    const password = document.querySelector('#authPassword').value;
    if (authMode === 'signup') {
      const response = await fetch('/api/signup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, profileType: new FormData(authForm).get('profileType'), privacyConsent: privacyConsent.checked })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) { authMessage.textContent = payload.error || '가입 확인 이메일을 보내지 못했어요.'; return; }
      authMessage.textContent = '가입 확인 이메일을 보냈어요. 이메일의 확인 버튼을 눌러 가입을 완료해 주세요.';
      return;
    }
    const result = await supabaseClient.auth.signInWithPassword({ email, password });
    if (result.error) {
      const message = result.error.message.toLowerCase();
      authMessage.textContent = message.includes('already registered')
        ? '이미 가입된 이메일이에요. 로그인해 주세요.'
        : message.includes('invalid login credentials')
          ? '이메일 또는 비밀번호를 확인해 주세요.'
          : message.includes('email not confirmed')
            ? '가입 확인 이메일에서 인증을 완료한 뒤 로그인해 주세요.'
            : message.includes('redirect')
              ? 'Supabase Auth URL 설정에 현재 사이트 주소를 허용해 주세요.'
            : result.error.message;
      return;
    }
    authMessage.textContent = '로그인되었습니다.';
    if (result.data.session) {
      closeModal(authModal);
      if (pendingResult) { const savedRecord = await saveAnalysisRecord(pendingResult, pendingInput); renderReminderAction(pendingResult, pendingInput, savedRecord); renderPurchaseDecision(pendingResult, pendingInput, savedRecord); pendingResult = null; pendingInput = null; }
      if (pendingHistoryId) await openHistoryDetail(pendingHistoryId);
    }
  } catch {
    authMessage.textContent = authMode === 'signup'
      ? '가입 요청을 처리하지 못했어요. Supabase와 Resend 서버 설정을 확인해 주세요.'
      : 'Supabase에 연결하지 못했어요. 프로젝트 URL, 공개 API 키와 Auth 설정을 확인해 주세요.';
  } finally {
    authSubmit.disabled = false;
  }
});

logoutButton.addEventListener('click', async () => { if (supabaseClient) await supabaseClient.auth.signOut(); });

document.querySelectorAll('input[name="reason"]').forEach((input) => input.addEventListener('change', () => document.querySelector('#otherPurpose').classList.toggle('visible', input.id === 'otherReason' && input.checked)));

function showError(message) { analysisResult.innerHTML = `<div class="result-error"><span>!</span><div><strong>분석을 잠시 멈췄어요.</strong><p>${message}</p></div></div>`; analysisResult.classList.add('visible'); analysisResult.setAttribute('aria-hidden', 'false'); }
function makeTextElement(tag, className, text) { const element = document.createElement(tag); element.className = className; element.textContent = text || '-'; return element; }

function renderAnalysis(result) {
  analysisResult.replaceChildren();
  const header = document.createElement('div'); header.className = 'result-header'; header.append(makeTextElement('div', 'result-badge', result.demo ? 'GREENCHOICE DEMO ANALYSIS' : 'GREENCHOICE AI ANALYSIS'), makeTextElement('h3', '', '나와 지구를 위한 소비 리포트'));
  const overview = document.createElement('div'); overview.className = 'result-overview';
  const necessity = document.createElement('div'); necessity.className = `result-hero necessity-${result.necessity_score}`; necessity.append(makeTextElement('span', 'result-label', '필요성 판단'), makeTextElement('strong', '', result.necessity_score), makeTextElement('p', '', result.necessity_reason));
  const verdict = document.createElement('div'); verdict.className = 'verdict-box'; verdict.append(makeTextElement('span', 'result-label', '최종 제안'), makeTextElement('strong', '', result.final_verdict), makeTextElement('p', '', result.encouragement_quote)); overview.append(necessity, verdict);
  const grid = document.createElement('div'); grid.className = 'result-grid';
  [['기회비용', result.opportunity_cost, 'opportunity-card'], ['예산 영향', result.budget_impact, 'budget-card'], [`환경 영향 · ${result.eco_impact?.level || '-'}`, result.eco_impact?.eco_tip, 'eco-card-result']].forEach(([title, text, className]) => { const card = document.createElement('article'); card.className = `result-detail-card ${className}`; card.append(makeTextElement('span', 'result-label', title), makeTextElement('p', '', text)); grid.append(card); });
  const alternatives = document.createElement('article'); alternatives.className = 'alternatives-card'; alternatives.append(makeTextElement('span', 'result-label', '더 나은 선택 아이디어'), makeTextElement('h4', '', '이렇게도 소비할 수 있어요')); const list = document.createElement('ul'); (Array.isArray(result.smart_alternatives) ? result.smart_alternatives : []).forEach((item) => { const li = document.createElement('li'); li.textContent = item; list.append(li); }); alternatives.append(list);
  analysisResult.append(header, overview, grid, alternatives); analysisResult.classList.add('visible'); analysisResult.setAttribute('aria-hidden', 'false');
}

function renderReminderAction(result, input, record) {
  if (!['3일 냉각기간 추천', '구매 비추천'].includes(result.final_verdict)) return;
  const action = document.createElement('div'); action.className = 'reminder-action';
  action.append(makeTextElement('span', 'reminder-kicker', 'COOLING REMINDER'), makeTextElement('strong', '', '🧊 3일 동안 생각 더해보기'), makeTextElement('p', '', '3일 뒤에 다시 확인할 수 있도록 리마인드 알림을 예약해요.'));
  const button = document.createElement('button'); button.type = 'button'; button.className = 'reminder-button'; button.textContent = currentUser ? '3일 뒤 리마인드 예약하기' : '로그인하고 리마인드 예약하기';
  button.addEventListener('click', async () => {
    if (!currentUser) { pendingResult = result; pendingInput = input; openAuth('login'); return; }
    if (!record?.id || String(record.id).startsWith('local-')) { action.querySelector('p').textContent = 'Supabase에 기록이 저장된 뒤 예약할 수 있어요.'; return; }
    button.disabled = true;
    const due = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);
    const response = await supabaseClient.from('reminders').insert({ user_id: currentUser.id, analysis_record_id: record.id, email: currentUser.email, item_name: input.item, price: input.price, remind_at: due.toISOString(), status: 'pending' });
    if (response.error) { action.querySelector('p').textContent = '리마인드 예약에 실패했어요. Supabase reminders 테이블을 확인해 주세요.'; button.disabled = false; return; }
    button.textContent = '✓ 3일 뒤 리마인드 예약 완료'; action.classList.add('scheduled');
  });
  action.append(button); analysisResult.append(action);
}

async function updateRecordStatus(record, status) {
  if (!currentUser || !record?.id) return false;
  if (String(record.id).startsWith('local-')) {
    const key = `greenchoice_history_${currentUser.id}`;
    const history = JSON.parse(localStorage.getItem(key) || '[]').map((item) => String(item.id) === String(record.id) ? { ...item, status } : item);
    localStorage.setItem(key, JSON.stringify(history));
    return true;
  }
  const response = await supabaseClient.from('analysis_records').update({ status }).eq('id', record.id).eq('user_id', currentUser.id);
  return !response.error;
}

function renderPurchaseDecision(result, input, record) {
  const shouldAsk = result.necessity_score === '필수' || result.necessity_score === '불필요' || result.final_verdict === '구매 비추천';
  if (!shouldAsk) return;
  const card = document.createElement('div'); card.className = 'purchase-decision';
  card.append(makeTextElement('span', 'reminder-kicker', 'ONE LAST CHECK'), makeTextElement('strong', '', result.necessity_score === '필수' ? '정말 필요한 물건이라면, 구매 여부를 기록해볼까요?' : '이번 소비를 어떻게 결정했나요?'), makeTextElement('p', '', '선택한 내용은 내 소비 히스토리에 반영돼요.'));
  const actions = document.createElement('div'); actions.className = 'purchase-decision-actions';
  [['purchased', '구매했어요'], ['skipped', '구매하지 않았어요']].forEach(([status, label]) => { const button = document.createElement('button'); button.type = 'button'; button.textContent = label; button.dataset.purchaseStatus = status; button.addEventListener('click', async () => { if (!currentUser) { pendingResult = result; pendingInput = input; openAuth('login'); return; } button.disabled = true; const saved = await updateRecordStatus(record, status); if (!saved) { button.disabled = false; return; } actions.replaceChildren(makeTextElement('span', 'decision-saved', status === 'purchased' ? '✓ 구매했어요로 기록했어요.' : '✓ 구매하지 않았어요로 기록했어요.')); }); actions.append(button); });
  card.append(actions); analysisResult.append(card);
}

async function openHistoryDetail(recordId) {
  if (!currentUser || !supabaseClient) { openAuth('login'); return; }
  const response = await supabaseClient.from('analysis_records').select('id,input_data,result_data,status,created_at').eq('id', recordId).eq('user_id', currentUser.id).single();
  if (response.error || !response.data) { historyDetailMessage.textContent = '이 소비 기록을 찾지 못했어요.'; openModal(historyDetailModal); return; }
  currentReminderRecord = response.data;
  const input = response.data.input_data || {}; historyDetailCopy.textContent = `${input.item || '고민하던 물건'} · ${Number(input.price || 0).toLocaleString('ko-KR')}원\n3일 전의 나와 지금의 생각을 비교해보세요.`;
  historyDetailMessage.textContent = ''; openModal(historyDetailModal);
}

document.querySelectorAll('[data-detail-status]').forEach((button) => button.addEventListener('click', async () => {
  if (!currentReminderRecord || !currentUser) return;
  button.disabled = true;
  const status = button.dataset.detailStatus;
  await supabaseClient.from('analysis_records').update({ status }).eq('id', currentReminderRecord.id).eq('user_id', currentUser.id);
  historyDetailMessage.textContent = status === 'skipped' ? '잘했어요. 구매하지 않기로 한 기록을 저장했어요.' : '지금도 필요한 물건이라면 오래 사용할 방법도 함께 생각해보세요.';
  currentReminderRecord.status = status;
  setTimeout(() => closeModal(historyDetailModal), 900);
}));

async function saveAnalysisRecord(result, input) {
  if (!currentUser) return;
  const estimatedCarbon = Math.max(0.5, Math.round((Number(input.price) / 10000) * 0.8 * 10) / 10);
  let saved = false;
  let record = { id: `local-${Date.now()}`, user_id: currentUser.id, input_data: input, result_data: result, status: 'pending', eco_tip_applied: false, estimated_carbon_kg: estimatedCarbon, created_at: new Date().toISOString() };
  if (supabaseClient) { const response = await supabaseClient.from('analysis_records').insert({ user_id: currentUser.id, input_data: input, result_data: result, status: 'pending', eco_tip_applied: false, estimated_carbon_kg: estimatedCarbon }).select().single(); if (!response.error && response.data) { saved = true; record = response.data; } }
  const historyKey = `greenchoice_history_${currentUser.id}`;
  const history = JSON.parse(localStorage.getItem(historyKey) || '[]');
  history.unshift(record);
  localStorage.setItem(historyKey, JSON.stringify(history.slice(0, 30)));
  if (!saved) localStorage.setItem(`greenchoice_last_analysis_${currentUser.id}`, JSON.stringify(history[0]));
  setBadgeCount(Number(localStorage.getItem(`greenchoice_badges_${currentUser.id}`) || 0) + 1);
  return record;
}

function estimateCarbon(record) { const input = record.input_data || record.input || {}; return Number(record.estimated_carbon_kg || Math.max(0.5, Math.round((Number(input.price || 0) / 10000) * 0.8 * 10) / 10)); }

const badgeDefinitions = [
  { id: 'first', title: '첫 발자국', icon: '✦', description: '첫 소비 분석을 완료했어요.', progress: (history) => `${Math.min(history.length, 1)} / 1`, earned: (history) => history.length > 0 },
  { id: 'shield', title: '철벽 방어', icon: '◇', description: '구매 비추천 물건을 3번 참아냈어요.', progress: (history) => `${Math.min(history.filter((record) => ['구매 비추천', '3일 냉각기간 추천'].includes((record.result_data || record.result || {}).final_verdict) && record.status === 'skipped').length, 3)} / 3`, earned: (history) => history.filter((record) => ['구매 비추천', '3일 냉각기간 추천'].includes((record.result_data || record.result || {}).final_verdict) && record.status === 'skipped').length >= 3 },
  { id: 'earth', title: '지구 수호대', icon: '♧', description: '친환경 팁 적용과 중고 구매를 3회 인증했어요.', progress: (history) => `${Math.min(history.filter((record) => record.status === 'secondhand' && record.eco_tip_applied).length, 3)} / 3`, earned: (history) => history.filter((record) => record.status === 'secondhand' && record.eco_tip_applied).length >= 3 },
  { id: 'wise', title: '현명한 소비왕', icon: '◎', description: '한 달간 예산 대비 지출을 80% 이하로 유지했어요.', progress: (history) => { const now = new Date(); const records = history.filter((record) => { const date = new Date(record.created_at || record.savedAt || 0); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }); const budget = records.reduce((sum, record) => sum + Number((record.input_data || record.input || {}).budget || 0), 0); const spent = records.filter((record) => record.status === 'purchased' || record.status === 'secondhand').reduce((sum, record) => sum + Number((record.input_data || record.input || {}).price || 0), 0); return budget ? `${Math.round((spent / budget) * 100)}% 사용` : '예산 입력 필요'; }, earned: (history) => { const now = new Date(); const records = history.filter((record) => { const date = new Date(record.created_at || record.savedAt || 0); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); }); const budget = records.reduce((sum, record) => sum + Number((record.input_data || record.input || {}).budget || 0), 0); const spent = records.filter((record) => record.status === 'purchased' || record.status === 'secondhand').reduce((sum, record) => sum + Number((record.input_data || record.input || {}).price || 0), 0); return budget > 0 && spent / budget <= .8; } }
];

function getBadges(history) { return badgeDefinitions.map((badge) => ({ ...badge, isEarned: badge.earned(history) })); }

function renderBadges(history) {
  const badges = getBadges(history); badgeProgress.textContent = `${badges.filter((badge) => badge.isEarned).length} / ${badges.length} 획득`; badgeGrid.replaceChildren();
  badges.forEach((badge) => { const button = document.createElement('button'); button.type = 'button'; button.className = `badge-card ${badge.isEarned ? 'earned' : 'locked'}`; button.dataset.badgeId = badge.id; button.append(makeTextElement('span', 'badge-icon', badge.icon), makeTextElement('strong', '', badge.title), makeTextElement('small', '', badge.isEarned ? '획득 완료 · 공유하기' : badge.progress(history)), makeTextElement('p', '', badge.description)); badgeGrid.append(button); });
}

function escapeXml(text) { return String(text).replace(/[<>&'"]/g, (character) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', "'": '&apos;', '"': '&quot;' }[character])); }

function openBadgeShare(badge) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="900" height="1100" viewBox="0 0 900 1100"><rect width="900" height="1100" rx="48" fill="#edf5d9"/><circle cx="700" cy="170" r="170" fill="#d8eab4"/><circle cx="150" cy="900" r="210" fill="#dcefe1"/><text x="90" y="130" fill="#6c996e" font-family="Arial,sans-serif" font-size="26" font-weight="700" letter-spacing="5">GREENCHOICE</text><text x="450" y="500" text-anchor="middle" fill="#27664b" font-family="Arial,sans-serif" font-size="190">${escapeXml(badge.icon)}</text><text x="450" y="680" text-anchor="middle" fill="#173d32" font-family="Arial,sans-serif" font-size="58" font-weight="700">${escapeXml(badge.title)}</text><text x="450" y="750" text-anchor="middle" fill="#6e8079" font-family="Arial,sans-serif" font-size="25">${escapeXml(badge.description)}</text><text x="450" y="970" text-anchor="middle" fill="#6da25b" font-family="Arial,sans-serif" font-size="27">나와 지구를 위한 소비 습관</text></svg>`;
  badgeShareImage.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`; badgeShareCopy.textContent = `${badge.title} 뱃지를 획득했어요.`; openModal(badgeShareModal);
}

badgeGrid.addEventListener('click', (event) => { const button = event.target.closest('[data-badge-id]'); if (!button || button.classList.contains('locked')) return; const badge = badgeDefinitions.find((item) => item.id === button.dataset.badgeId); if (badge) openBadgeShare(badge); });
nativeShareButton.addEventListener('click', async () => { const shareText = `Greenchoice에서 '${badgeShareCopy.textContent}'`; if (navigator.share) await navigator.share({ title: 'Greenchoice 소비 뱃지', text: shareText, url: window.location.href }); else { await navigator.clipboard?.writeText(shareText); nativeShareButton.textContent = '✓ 공유 문구가 복사됐어요'; } });

function renderSavingsStats(history) {
  const savedRecords = history.filter((record) => record.status === 'skipped' || record.status === 'secondhand');
  const money = savedRecords.reduce((sum, record) => sum + Number(record.input_data?.price || 0), 0);
  const carbon = savedRecords.reduce((sum, record) => sum + estimateCarbon(record), 0);
  savedMoney.textContent = `${money.toLocaleString('ko-KR')}원`;
  savedCarbon.textContent = `${Math.round(carbon * 10) / 10}kg`;
}

function renderDashboard(history) {
  const now = new Date(); const monthRecords = history.filter((record) => { const date = new Date(record.created_at || record.savedAt || 0); return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth(); });
  const judged = history.filter((record) => ['purchased', 'skipped', 'secondhand'].includes(record.status));
  const recommendedBought = judged.filter((record) => (record.result_data || record.result || {}).final_verdict === '지금 구매 추천' && record.status === 'purchased').length;
  const followedAvoid = judged.filter((record) => (record.result_data || record.result || {}).final_verdict !== '지금 구매 추천' && (record.status === 'skipped' || record.status === 'secondhand')).length;
  const ignored = judged.filter((record) => (record.result_data || record.result || {}).final_verdict !== '지금 구매 추천' && record.status === 'purchased').length;
  monthlyAnalyses.textContent = `${monthRecords.length}회`; aiRecommendedBought.textContent = `${recommendedBought}회`; aiFollowedAvoid.textContent = `${followedAvoid}회`; aiIgnored.textContent = `${ignored}회`;

  const purposeMap = new Map(); history.forEach((record) => { const input = record.input_data || record.input || {}; const purpose = input.purpose || '기타'; purposeMap.set(purpose, (purposeMap.get(purpose) || 0) + Number(input.price || 0)); });
  const purposeEntries = [...purposeMap.entries()].sort((a, b) => b[1] - a[1]); const total = purposeEntries.reduce((sum, [, amount]) => sum + amount, 0); purposeTotal.textContent = `${Math.round(total).toLocaleString('ko-KR')}원`;
  const colors = ['#78ad83', '#e7bd71', '#a9c777', '#e69a7b', '#a8a6d4', '#b7c4bb'];
  purposeLegend.replaceChildren(); purposeEntries.forEach(([purpose, amount], index) => { const item = document.createElement('span'); item.innerHTML = `<i style="background:${colors[index % colors.length]}"></i>${purpose} ${total ? Math.round((amount / total) * 100) : 0}%`; purposeLegend.append(item); });
  if (purposeChart) purposeChart.destroy();
  if (window.Chart && purposeEntries.length) purposeChart = new window.Chart(document.querySelector('#purposeChart'), { type: 'doughnut', data: { labels: purposeEntries.map(([purpose]) => purpose), datasets: [{ data: purposeEntries.map(([, amount]) => amount), backgroundColor: colors, borderWidth: 3, borderColor: '#fffefa', hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, cutout: '70%', plugins: { legend: { display: false }, tooltip: { callbacks: { label: (context) => ` ${Number(context.raw).toLocaleString('ko-KR')}원` } } } } });

  const complianceTotal = recommendedBought + followedAvoid + ignored; const compliance = complianceTotal ? Math.round(((recommendedBought + followedAvoid) / complianceTotal) * 100) : 0; guideRate.textContent = `${compliance}%`; guideCopy.innerHTML = complianceTotal ? `AI 추천과 같은 방향의 선택<br /><strong>${recommendedBought + followedAvoid}회</strong>를 기록했어요.` : '아직 충분한 기록이 없어요.<br />분석 결과를 저장해보세요.'; document.querySelector('.guide-ring').style.setProperty('--rate', `${compliance * 3.6}deg`);
  const savedCarbonValue = history.filter((record) => record.status === 'skipped' || record.status === 'secondhand').reduce((sum, record) => sum + estimateCarbon(record), 0); const trees = Math.round((savedCarbonValue / 10) * 10) / 10; carbonTrees.textContent = `소나무 ${trees}그루를 심은 효과`; carbonDetail.textContent = `${Math.round(savedCarbonValue * 10) / 10}kg CO₂ 절감`;
}

async function fetchHistory() {
  if (!currentUser) return [];
  if (supabaseClient) {
    const response = await supabaseClient.from('analysis_records').select('id,user_id,input_data,result_data,status,eco_tip_applied,estimated_carbon_kg,created_at').eq('user_id', currentUser.id).order('created_at', { ascending: false });
    if (!response.error && Array.isArray(response.data)) {
      localStorage.setItem(`greenchoice_history_${currentUser.id}`, JSON.stringify(response.data));
      return response.data;
    }
  }
  return JSON.parse(localStorage.getItem(`greenchoice_history_${currentUser.id}`) || '[]');
}

async function renderHistory() {
  historyList.replaceChildren();
  if (!currentUser) return;
  historyList.append(makeTextElement('p', 'empty-history', '기록을 불러오는 중이에요...'));
  const history = await fetchHistory();
  renderSavingsStats(history);
  renderDashboard(history);
  renderBadges(history);
  historyList.replaceChildren();
  if (!history.length) { historyList.append(makeTextElement('p', 'empty-history', '아직 저장된 소비 분석 기록이 없어요.')); return; }
  history.forEach((record) => {
    const input = record.input_data || record.input || {}; const result = record.result_data || record.result || {}; const status = record.status || 'pending';
    const item = document.createElement('article'); item.className = 'history-item';
    const date = new Date(record.created_at || record.savedAt || Date.now()).toLocaleDateString('ko-KR', { year: 'numeric', month: 'long', day: 'numeric' });
    const statusLabel = { pending: '아직 결정 전', skipped: '참았어요!', purchased: '구매했어요', secondhand: '중고로 샀어요' }[status] || status;
    item.append(makeTextElement('div', 'history-date', date), makeTextElement('h3', '', input.item), makeTextElement('span', 'history-verdict', result.final_verdict || '분석 완료'), makeTextElement('p', '', `${Number(input.price).toLocaleString('ko-KR')}원 · ${input.mode} 모드`), makeTextElement('div', 'history-carbon', `예상 탄소 ${estimateCarbon(record)}kg · ${statusLabel}`));
    const actions = document.createElement('div'); actions.className = 'history-actions';
    [['skipped', '참았어요! (지출 안 함)'], ['purchased', '구매했어요'], ['secondhand', '중고로 샀어요']].forEach(([nextStatus, label]) => { const button = document.createElement('button'); button.type = 'button'; button.dataset.recordId = record.id; button.dataset.status = nextStatus; button.textContent = label; button.className = nextStatus === status ? 'active' : ''; actions.append(button); });
    if (status === 'secondhand') { const ecoButton = document.createElement('button'); ecoButton.type = 'button'; ecoButton.dataset.recordId = record.id; ecoButton.dataset.eco = 'true'; ecoButton.textContent = record.eco_tip_applied ? '✓ 친환경 팁 인증 완료' : '친환경 팁 적용했어요'; ecoButton.className = record.eco_tip_applied ? 'active eco-cert' : 'eco-cert'; actions.append(ecoButton); }
    item.append(actions);
    historyList.append(item);
  });
}

historyList.addEventListener('click', async (event) => {
  const button = event.target.closest('button[data-record-id]');
  if (!button || !currentUser) return;
  button.disabled = true;
  const id = button.dataset.recordId; const status = button.dataset.status;
  if (button.dataset.eco === 'true') {
    const ecoValue = !JSON.parse(localStorage.getItem(`greenchoice_history_${currentUser.id}`) || '[]').find((record) => String(record.id) === String(id))?.eco_tip_applied;
    if (String(id).startsWith('local-')) { const key = `greenchoice_history_${currentUser.id}`; const history = JSON.parse(localStorage.getItem(key) || '[]').map((record) => String(record.id) === String(id) ? { ...record, eco_tip_applied: ecoValue } : record); localStorage.setItem(key, JSON.stringify(history)); }
    else if (supabaseClient) await supabaseClient.from('analysis_records').update({ eco_tip_applied: ecoValue }).eq('id', id).eq('user_id', currentUser.id);
    await renderHistory(); return;
  }
  if (String(id).startsWith('local-')) {
    const key = `greenchoice_history_${currentUser.id}`; const history = JSON.parse(localStorage.getItem(key) || '[]').map((record) => String(record.id) === String(id) ? { ...record, status } : record); localStorage.setItem(key, JSON.stringify(history));
  } else if (supabaseClient) {
    await supabaseClient.from('analysis_records').update({ status }).eq('id', id).eq('user_id', currentUser.id);
  }
  await renderHistory();
});

function openSavePrompt(result, input) { pendingResult = result; pendingInput = input; openModal(savePrompt); }
document.querySelectorAll('#saveLoginButton, #challengeLoginButton').forEach((button) => button.addEventListener('click', () => { closeModal(savePrompt); openAuth('login'); }));

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (!getValue('item') || !getValue('price')) return;
  const purpose = getValue('reason') === '기타' ? getValue('otherPurpose') : getValue('reason');
  const input = { mode: document.querySelector('.mode-button.active')?.dataset.mode === 'adult' ? '성인' : '청소년', item: getValue('item'), price: Number(getValue('price')), budget: Number(getValue('budget')) || 0, purpose, frequency: getValue('frequency'), hasSimilarItem: getValue('duplicate'), considersSecondhand: getValue('recycle') };
  analysisResult.classList.remove('visible'); analysisResult.setAttribute('aria-hidden', 'true'); loadingCard.classList.add('visible'); loadingCard.setAttribute('aria-hidden', 'false'); loadingCard.scrollIntoView({ behavior: 'smooth', block: 'center' });
  try { const response = await fetch('/api/analyze', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) }); const payload = await response.json(); if (!response.ok || !payload.result) throw new Error(payload.error || '분석 결과를 받지 못했습니다.'); renderAnalysis(payload.result); const record = currentUser ? await saveAnalysisRecord(payload.result, input) : null; renderReminderAction(payload.result, input, record); renderPurchaseDecision(payload.result, input, record); if (!currentUser) setTimeout(() => openSavePrompt(payload.result, input), 350); } catch (error) { showError(error.message || '잠시 후 다시 시도해 주세요.'); } finally { loadingCard.classList.remove('visible'); loadingCard.setAttribute('aria-hidden', 'true'); analysisResult.scrollIntoView({ behavior: 'smooth', block: 'center' }); }
});

resetButton.addEventListener('click', () => { loadingCard.classList.remove('visible'); loadingCard.setAttribute('aria-hidden', 'true'); analysisResult.classList.remove('visible'); analysisResult.replaceChildren(); form.reset(); document.querySelector('#otherPurpose').classList.remove('visible'); document.querySelector('#analyze').scrollIntoView({ behavior: 'smooth' }); });

supabaseReadyPromise = initSupabase();
