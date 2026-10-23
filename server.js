const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

try { process.loadEnvFile(); } catch (error) { if (error.code !== 'ENOENT') throw error; }

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const resendApiKey = process.env.RESEND_API_KEY;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const signupWindows = new Map();
const privacyPolicyVersion = '1.0';
const requiredKeys = ['necessity_score', 'necessity_reason', 'opportunity_cost', 'budget_impact', 'eco_impact', 'smart_alternatives', 'final_verdict', 'final_verdict_reason', 'encouragement_quote'];

const systemPrompt = `너는 합리적 소비를 돕는 친환경 소비 분석 엔진이다. 사용자가 보낸 구매 정보를 분석한다.
반드시 마크다운, 코드펜스, 인사말 없이 아래 JSON 하나만 반환한다. 모든 설명은 한국어로 쓴다.
사용자가 입력하지 않은 제품 정보, 가격, 소재, 제조국, 수치, 탄소량을 만들어내지 않는다. 정확한 제품 사양을 모르면 제품군 기준의 일반적인 참고 의견이라고 밝힌다.
필요성은 입력된 구매 목적, 사용 빈도, 비슷한 물건 보유 여부, 예산을 근거로 판단한다. 필요성 판단과 최종 제안은 서로 일치시킨다.
- 불필요: 구매 목적이 충동적 지적 욕구 또는 스트레스 해소이거나, 비슷한 물건이 이미 있거나, 사용 빈도가 가끔/이벤트성이거나, 가격이 입력 예산의 80%를 초과하는 경우.
- 필수: 위 불필요 조건이 없고, 구매 목적이 필수품이며, 사용 빈도가 매일 또는 주 1~2회이고, 비슷한 물건이 없으며, 가격이 예산의 25% 이하이거나 예산이 입력되지 않은 경우.
- 심사숙고: 위 두 기준에 해당하지 않는 경우.
분류에 따라 final_verdict는 필수=지금 구매 추천, 심사숙고=3일 냉각기간 추천, 불필요=구매 비추천으로 쓴다.
necessity_reason은 2~3문장으로 입력에서 실제로 영향을 준 항목을 구체적으로 설명한다. final_verdict_reason은 최종 제안의 이유와 사용자가 취할 다음 행동을 1~2문장으로 쓴다.
opportunity_cost는 가격으로 포기하게 되는 다른 선택을 설명하되, 근거 없는 임금·시간·상품 가격을 단정하지 않는다.
budget_impact는 예산 입력 유무에 따른 부담 해석을 한 문장으로 쓴다. 숫자 비율은 서버가 입력값으로 계산하므로 새 비율을 추측하지 않는다.
환경 영향은 제품의 전체 생애주기 정보가 없으면 정량 탄소량을 제시하지 않는다. eco_impact.reason에는 제품군 기준의 환경 고려점을, eco_tip에는 구매 전 또는 사용 중 실천할 수 있는 구체적인 방법을 쓴다.
smart_alternatives에는 이 제품에 맞는 실용적인 대안 2~3개를 쓴다.
안전 또는 법적 구매 제한이 분명한 품목은 구매를 권하지 않고 관련 규정을 확인하도록 안내한다.
JSON 형식:
{
  "necessity_score": "필수 | 심사숙고 | 불필요",
  "necessity_reason": "입력한 목적·빈도·보유 여부·예산을 근거로 한 2~3문장",
  "opportunity_cost": "이 가격으로 선택할 수 있는 다른 용도",
  "budget_impact": "예산 입력 여부와 부담에 대한 짧은 설명",
  "eco_impact": { "level": "높음 | 중간 | 낮음", "reason": "제품군에서 고려할 환경 영향과 불확실성", "eco_tip": "실천 가능한 환경 보호 방법" },
  "smart_alternatives": ["제품에 맞는 대안 1", "중고·수리·대여 등 대안 2"],
  "final_verdict": "지금 구매 추천 | 3일 냉각기간 추천 | 구매 비추천",
  "final_verdict_reason": "최종 제안의 근거와 다음 행동 1~2문장",
  "encouragement_quote": "부담을 주지 않는 응원 한 문장"
}
예산이 입력되지 않았다면 예산 부담을 계산할 수 없다고 정직하게 설명한다.`;

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }

function getSupabaseBaseUrl() {
  const url = new URL(process.env.SUPABASE_URL);
  url.pathname = url.pathname.replace(/\/rest\/v1\/?$/, '').replace(/\/+$/, '') || '/';
  return url.toString().replace(/\/$/, '');
}

function escapeHtml(value) {
  return String(value).replace(/[&<>"']/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character]));
}

function allowSignupAttempt(req) {
  const forwarded = req.headers['x-forwarded-for'];
  const ip = (forwarded ? forwarded.split(',').at(-1).trim() : req.socket.remoteAddress) || 'unknown';
  const now = Date.now();
  const window = signupWindows.get(ip);
  if (!window || window.resetAt <= now) {
    signupWindows.set(ip, { count: 1, resetAt: now + 15 * 60 * 1000 });
    return true;
  }
  if (window.count >= 5) return false;
  window.count += 1;
  return true;
}

function isValidResult(result) {
  return result
    && requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(result, key))
    && ['필수', '심사숙고', '불필요'].includes(result.necessity_score)
    && ['지금 구매 추천', '3일 냉각기간 추천', '구매 비추천'].includes(result.final_verdict)
    && requiredKeys.filter((key) => !['eco_impact', 'smart_alternatives'].includes(key)).every((key) => typeof result[key] === 'string' && result[key].trim())
    && result.eco_impact
    && ['높음', '중간', '낮음'].includes(result.eco_impact.level)
    && typeof result.eco_impact.reason === 'string'
    && typeof result.eco_impact.eco_tip === 'string'
    && Array.isArray(result.smart_alternatives)
    && result.smart_alternatives.length >= 2
    && result.smart_alternatives.every((item) => typeof item === 'string' && item.trim());
}

function demoScore(input) {
  const ratio = input.budget ? Number(input.price) / Number(input.budget) : 0;
  if (['충동적 지적 욕구', '스트레스 해소'].includes(input.purpose) || input.hasSimilarItem === '예' || ['가끔', '이벤트성'].includes(input.frequency) || ratio > .8) return ['불필요', '구매 비추천'];
  if (input.purpose === '필수품' && ['매일', '주 1~2회'].includes(input.frequency) && input.hasSimilarItem !== '예' && (ratio <= .25 || !input.budget)) return ['필수', '지금 구매 추천'];
  return ['심사숙고', '3일 냉각기간 추천'];
}

function normalizeDecision(input, result) {
  const [score, verdict] = demoScore(input);
  return { ...result, necessity_score: score, final_verdict: verdict, budget_impact: buildBudgetImpact(input, result.budget_impact) };
}

function buildBudgetImpact(input, note = '') {
  const price = Math.max(0, Number(input.price) || 0);
  const budget = Math.max(0, Number(input.budget) || 0);
  const formatWon = (amount) => `${amount.toLocaleString('ko-KR')}원`;
  if (!budget) return `이번 달 예산을 입력하지 않아 예산 대비 비율을 계산할 수 없습니다. 예상 가격은 ${formatWon(price)}입니다. ${note}`.trim();
  const ratio = Math.round((price / budget) * 100);
  const remaining = budget - price;
  const remainingText = remaining >= 0 ? `구매 후 입력 예산에서 ${formatWon(remaining)}이 남습니다.` : `입력 예산보다 ${formatWon(Math.abs(remaining))}을 초과합니다.`;
  return `예상 가격 ${formatWon(price)}은 입력 예산 ${formatWon(budget)}의 약 ${ratio}%입니다. ${remainingText} ${note}`.trim();
}

function demoResult(input) {
  const [score, verdict] = demoScore(input);
  return { demo: true, necessity_score: score, necessity_reason: `${input.item}을(를) ${input.purpose} 목적과 ${input.frequency} 사용 기준으로 살펴봤어요. ${input.hasSimilarItem === '예' ? '비슷한 물건을 이미 가지고 있다는 점을 반영했어요.' : '비슷한 물건이 없다고 답한 점을 반영했어요.'}`, opportunity_cost: `${Number(input.price).toLocaleString('ko-KR')}원을 다른 필요한 지출이나 저축을 위해 남겨둘 수도 있어요.`, budget_impact: buildBudgetImpact(input, '데모 분석에서는 입력 정보를 기준으로 예산 영향을 계산했어요.'), eco_impact: { level: '중간', reason: '제품의 소재와 제조·배송 정보가 없어 제품군 기준의 일반적인 참고 판단이에요.', eco_tip: '오래 사용할 수 있는 제품을 고르고, 구매 전 중고·리사이클 제품도 비교해보세요.' }, smart_alternatives: ['필요한 기능만 갖춘 제품이나 수리 가능한 모델을 비교해보세요.', '중고 거래 또는 대여로 먼저 사용해볼 수 있어요.'], final_verdict: verdict, final_verdict_reason: `입력한 구매 목적, 사용 빈도, 보유 여부와 예산 조건을 기준으로 ${verdict}을 제안해요. 구매 전 비슷한 제품과 대안을 한 번 더 비교해보세요.`, encouragement_quote: '천천히 비교하고 오래 쓰는 선택도 충분히 멋진 소비예요.' };
}

async function analyze(input) {
  if (!apiKey) return demoResult(input);
  const response = await fetch('https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini request failed', response.status, errorData.error?.status || 'unknown', errorData.error?.message || 'unknown');
    if (response.status === 401 || response.status === 403) throw new Error('Gemini API 키 또는 API 사용 권한을 확인해 주세요.');
    if (response.status === 404) throw new Error('Gemini 모델 주소를 찾지 못했어요. 서버 설정을 확인해 주세요.');
    if (response.status === 429) throw new Error('Gemini 사용 한도에 도달했어요. 잠시 후 다시 시도해 주세요.');
    if (response.status >= 500) throw new Error(`Gemini 분석 서버에 일시적인 오류가 발생했어요 (${response.status}). 잠시 후 다시 시도해 주세요.`);
    if (response.status === 400) throw new Error('Gemini 요청 형식을 처리하지 못했어요. 분석 입력을 확인해 주세요.');
    throw new Error('AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
  const data = await response.json();
  let result;
  try {
    const text = data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('').trim() || '';
    const start = text.indexOf('{');
    const end = text.lastIndexOf('}');
    if (start < 0 || end <= start) throw new Error('JSON object missing');
    result = JSON.parse(text.slice(start, end + 1));
  } catch { throw new Error('AI 응답을 JSON으로 읽지 못했습니다. 다시 시도해 주세요.'); }
  if (!isValidResult(result)) throw new Error('Gemini 분석 결과에 필요한 항목이 빠져 있어요. 다시 시도해 주세요.');
  return normalizeDecision(input, result);
}

async function serveFile(req, res) {
  const requested = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  const filePath = path.resolve(root, `.${requested === '/' ? '/index.html' : requested}`);
  if (!filePath.startsWith(root)) return json(res, 403, { error: '접근할 수 없습니다.' });
  try {
    const file = await fs.readFile(filePath);
    const types = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8' };
    res.writeHead(200, { 'Content-Type': types[path.extname(filePath)] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    res.end(file);
  } catch {
    if (!path.extname(requested)) {
      const index = await fs.readFile(path.join(root, 'index.html'));
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
      res.end(index);
      return;
    }
    json(res, 404, { error: '페이지를 찾을 수 없습니다.' });
  }
}

const server = http.createServer(async (req, res) => {
  if (req.method === 'GET' && req.url === '/__preview-bridge.js') {
    res.writeHead(204, { 'Content-Type': 'text/javascript; charset=utf-8' });
    return res.end();
  }
  if (req.method === 'GET' && req.url === '/api/config') {
    return json(res, 200, { supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' });
  }
  if (req.method === 'POST' && req.url === '/api/signup') {
    let raw = '';
    let tooLarge = false;
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10000) { tooLarge = true; raw = ''; }
    });
    req.on('end', async () => {
      if (tooLarge) return json(res, 413, { error: '입력 내용이 너무 커요.' });
      if (!resendApiKey || !supabaseServiceKey || !process.env.SUPABASE_URL) {
        return json(res, 503, { error: '가입 이메일 서버 설정이 아직 완료되지 않았어요.' });
      }

      let input;
      try { input = JSON.parse(raw); } catch { return json(res, 400, { error: '회원가입 정보를 확인해 주세요.' }); }
      const email = String(input.email || '').trim().toLowerCase();
      const password = String(input.password || '');
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 6 || password.length > 128) {
        return json(res, 400, { error: '이메일과 6자 이상 비밀번호를 확인해 주세요.' });
      }
      if (input.privacyConsent !== true) return json(res, 400, { error: '개인정보처리방침에 동의해야 회원가입할 수 있어요.' });
      if (!allowSignupAttempt(req)) return json(res, 429, { error: '가입 요청이 많아요. 잠시 후 다시 시도해 주세요.' });

      let redirectTo;
      try {
        const origin = new URL(req.headers.origin);
        if (!['https:', 'http:'].includes(origin.protocol) || (origin.protocol === 'http:' && origin.hostname !== 'localhost')) throw new Error('Invalid origin');
        redirectTo = origin.origin;
      } catch { return json(res, 400, { error: '확인 이메일을 보낼 사이트 주소를 확인할 수 없어요.' }); }

      try {
        const supabaseUrl = getSupabaseBaseUrl();
        const signupResponse = await fetch(`${supabaseUrl}/auth/v1/admin/generate_link?redirect_to=${encodeURIComponent(redirectTo)}`, {
          method: 'POST',
          headers: { apikey: supabaseServiceKey, Authorization: `Bearer ${supabaseServiceKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'signup', email, password, data: { privacy_consent: true, privacy_policy_version: privacyPolicyVersion, privacy_consented_at: new Date().toISOString() } })
        });
        const signupPayload = await signupResponse.json().catch(() => ({}));
        if (!signupResponse.ok) {
          const message = [signupPayload.msg, signupPayload.message, signupPayload.error_description].filter(Boolean).join(' ');
          const exists = /already|registered/i.test(message);
          return json(res, exists ? 409 : 502, { error: exists ? '이미 가입된 이메일이에요. 로그인해 주세요.' : 'Supabase에서 가입 확인 링크를 만들지 못했어요.' });
        }

        const actionLink = signupPayload.properties?.action_link || signupPayload.action_link;
        if (!actionLink || new URL(actionLink).origin !== new URL(supabaseUrl).origin) {
          return json(res, 502, { error: '가입 확인 링크를 만들지 못했어요.' });
        }

        const confirmUrl = escapeHtml(actionLink);
        const mailResponse = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: { Authorization: `Bearer ${resendApiKey}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            from: process.env.RESEND_FROM || 'Greenchoice <onboarding@resend.dev>',
            to: [email],
            subject: '그린초이스 가입을 확인해 주세요',
            html: `<div style="font-family:Arial,sans-serif;line-height:1.8;color:#173d32"><h2>그린초이스 가입 확인</h2><p>아래 버튼을 눌러 이메일 주소를 확인하고 회원가입을 완료해 주세요.</p><p><a href="${confirmUrl}" style="display:inline-block;padding:12px 18px;border-radius:8px;background:#27664b;color:#fff;text-decoration:none">이메일 확인하고 가입 완료하기</a></p><p>본인이 신청하지 않았다면 이 메일을 무시해 주세요.</p></div>`,
            text: `그린초이스 가입을 완료하려면 아래 링크를 열어 이메일 주소를 확인해 주세요.\n${actionLink}\n본인이 신청하지 않았다면 이 메일을 무시해 주세요.`
          })
        });
        if (!mailResponse.ok) {
          console.error('Resend email request failed', mailResponse.status);
          return json(res, 502, { error: '가입 확인 이메일을 보내지 못했어요. Resend 발신 주소 설정을 확인해 주세요.' });
        }
        return json(res, 200, { message: '가입 확인 이메일을 보냈어요.' });
      } catch {
        return json(res, 502, { error: '가입 확인 이메일을 보내지 못했어요. 서버 설정을 확인해 주세요.' });
      }
    });
    return;
  }
  if (req.method === 'POST' && req.url === '/api/analyze') {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; if (raw.length > 10000) req.destroy(); });
    req.on('end', async () => { try { const result = await analyze(JSON.parse(raw)); json(res, 200, { result }); } catch (error) { json(res, 502, { error: error.message }); } });
    return;
  }
  if (req.method === 'GET') return serveFile(req, res);
  json(res, 405, { error: '지원하지 않는 요청입니다.' });
});

server.listen(port, '0.0.0.0', () => console.log(`greenchoice server listening on ${port}`));
