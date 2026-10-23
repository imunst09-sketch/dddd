const http = require('node:http');
const fs = require('node:fs/promises');
const path = require('node:path');

const root = __dirname;
const port = Number(process.env.PORT || 3000);
const apiKey = process.env.GEMINI_API_KEY;
const requiredKeys = ['necessity_score', 'necessity_reason', 'opportunity_cost', 'budget_impact', 'eco_impact', 'smart_alternatives', 'final_verdict', 'encouragement_quote'];

const systemPrompt = `너는 청소년과 성인의 합리적 소비를 돕는 친환경 소비 분석 엔진이다. 사용자가 보낸 구매 정보를 분석한다.
반드시 다른 설명, 마크다운, 코드펜스, 인사말 없이 아래 JSON 객체 하나만 반환한다.
JSON의 모든 값은 한국어로 작성한다. 점수나 분류는 지정된 선택지 중 하나만 사용한다.
필요성 판단을 무조건 심사숙고로 답하지 않는다. 입력값에 따라 아래 기준을 우선 적용한다.
- 필수: 구매 목적이 필수품이고, 사용 빈도가 매일 또는 주 1~2회이며, 비슷한 물건이 없고, 가격이 예산의 25% 이하이거나 예산이 입력되지 않은 경우.
- 불필요: 구매 목적이 충동적 지적 욕구 또는 스트레스 해소이고 사용 빈도가 가끔/이벤트성이거나, 비슷한 물건이 이미 있거나, 가격이 예산의 80%를 초과하는 경우.
- 심사숙고: 필수와 불필요 조건에 해당하지 않는 모든 경우.
필수이면 final_verdict는 지금 구매 추천, 불필요이면 구매 비추천, 심사숙고이면 3일 냉각기간 추천으로 맞춘다. 여러 조건이 겹치면 불필요를 우선하고, 그 다음 필수, 나머지는 심사숙고로 판단한다.
형식:
{
  "necessity_score": "필수 | 심사숙고 | 불필요",
  "necessity_reason": "판단 이유 2~3문장",
  "opportunity_cost": "입력된 모드에 맞춘 가격의 체감 가치",
  "budget_impact": "예산 대비 지출 비율(%) 및 부담도 코멘트",
  "eco_impact": { "level": "높음 | 중간 | 낮음", "eco_tip": "제품 카테고리의 환경 영향 및 친환경 팁 1가지" },
  "smart_alternatives": ["더 저렴하거나 실용적인 카테고리 대안 1", "중고 거래 또는 수리/대여 대안 2"],
  "final_verdict": "지금 구매 추천 | 3일 냉각기간 추천 | 구매 비추천",
  "encouragement_quote": "합리적 소비 습관을 응원하는 따뜻한 1문장"
}
예산이 0이면 예산 영향에 예산을 입력하지 않았다는 점을 정직하게 쓴다. 청소년 모드에서는 알바 시간을 단정하지 말고 일반적인 최저임금 수준을 참고한 대략적 체감으로 표현한다. 안전하지 않거나 청소년 구매 제한 품목이면 구매 비추천과 보호자 확인을 권한다.`;

function json(res, status, body) { res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); }

function isValidResult(result) {
  return result && requiredKeys.every((key) => Object.prototype.hasOwnProperty.call(result, key)) && result.eco_impact && Array.isArray(result.smart_alternatives);
}

function demoScore(input) {
  const ratio = input.budget ? Number(input.price) / Number(input.budget) : 0;
  if (['충동적 지적 욕구', '스트레스 해소'].includes(input.purpose) || input.hasSimilarItem === '예' || ['가끔', '이벤트성'].includes(input.frequency) || ratio > .8) return ['불필요', '구매 비추천'];
  if (input.purpose === '필수품' && ['매일', '주 1~2회'].includes(input.frequency) && input.hasSimilarItem !== '예' && (ratio <= .25 || !input.budget)) return ['필수', '지금 구매 추천'];
  return ['심사숙고', '3일 냉각기간 추천'];
}

function normalizeDecision(input, result) {
  const [score, verdict] = demoScore(input);
  return { ...result, necessity_score: score, final_verdict: verdict };
}

function demoResult(input) {
  const [score, verdict] = demoScore(input);
  return { demo: true, necessity_score: score, necessity_reason: `${input.item}은(는) 입력한 구매 목적, 사용 빈도, 기존 보유 여부와 예산을 함께 비교해 ${score}으로 판단했어요. 조건이 달라지면 판단도 달라질 수 있어요.`, opportunity_cost: input.mode === '청소년' ? `${Math.max(1, Math.round(input.price / 10000))}번의 작은 취미 활동 비용으로도 쓸 수 있어요.` : `월 예산의 일부를 다른 생활비나 저축으로 남겨둘 수 있어요.`, budget_impact: input.budget ? `예산의 약 ${Math.round((input.price / input.budget) * 100)}%를 사용하는 금액이에요.` : '이번 달 예산을 입력하면 지출 비율을 더 정확하게 확인할 수 있어요.', eco_impact: { level: '중간', eco_tip: '오래 사용할 수 있는 제품을 고르고, 구매 전 중고·리사이클 제품을 먼저 비교해보세요.' }, smart_alternatives: ['비슷한 기능의 보급형 제품이나 필요한 기능만 담긴 모델 비교하기', '중고 거래, 수리, 대여로 먼저 사용해본 뒤 구매하기'], final_verdict: verdict, encouragement_quote: '천천히 비교하고 오래 쓰는 선택도 충분히 멋진 소비예요.' };
}

async function analyze(input) {
  if (!apiKey) return demoResult(input);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.6-flash:generateContent?key=${encodeURIComponent(apiKey)}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: systemPrompt }] }, contents: [{ role: 'user', parts: [{ text: JSON.stringify(input) }] }], generationConfig: { temperature: 0.4, responseMimeType: 'application/json' } })
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    console.error('Gemini request failed', response.status, errorData.error?.status || 'unknown', errorData.error?.message || 'unknown');
    if (response.status === 401 || response.status === 403 || response.status === 404 || response.status === 429) return demoResult(input);
    throw new Error('AI 분석 요청에 실패했습니다. 잠시 후 다시 시도해 주세요.');
  }
  const data = await response.json();
  let result;
  try { result = JSON.parse(data.candidates?.[0]?.content?.parts?.map((part) => part.text || '').join('') || ''); } catch { throw new Error('AI 응답을 JSON으로 읽지 못했습니다. 다시 시도해 주세요.'); }
  if (!isValidResult(result)) throw new Error('AI 응답 형식이 올바르지 않습니다. 다시 시도해 주세요.');
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
  if (req.method === 'GET' && req.url === '/api/config') {
    return json(res, 200, { supabaseUrl: process.env.SUPABASE_URL || '', supabaseAnonKey: process.env.SUPABASE_ANON_KEY || '' });
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
