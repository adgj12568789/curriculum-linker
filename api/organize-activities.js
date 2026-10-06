export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });

  const { text, defaults = {} } = req.body || {};
  const sourceText = String(text || '').trim();
  if (!sourceText) return res.status(400).json({ message: '정리할 활동 내용이 없습니다.' });
  if (sourceText.length > 50000) return res.status(400).json({ message: '붙여 넣은 내용이 너무 깁니다. 한 번에 5만 자 이하로 입력해 주세요.' });

  const fallback = heuristic(sourceText, defaults);
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ source: 'fallback', activities: fallback });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `당신은 대한민국 중학교 교사의 수업 활동 시간표를 정리하는 AI입니다.
사용자가 복사해 붙여 넣은 학교 시간표, 수업 계획, 메모를 아래 구조의 JSON 배열로 정리하세요.

필수 필드:
- day: 월/화/수/목/금 중 하나
- period: 1~7 중 하나 (숫자만)
- grade: 1/2/3 중 하나 (숫자만)
- subject: 과목명
- content: 실제 수업 활동 내용
- group: 활동 탭 이름. 2~6글자 정도의 짧은 분류명. 예: 자료 분석, 토론, 발표, 자료 조사, 모둠 협력, 프로젝트, 퀴즈, 글쓰기, 체험·실습

중요 규칙
1. 사용자가 붙여 넣은 내용에 없는 활동을 새로 만들지 마세요.
2. 한 셀에 여러 정보가 섞여 있으면 문맥상 가장 자연스럽게 행과 열을 복원하세요.
3. 반복되는 학년·과목·요일은 다음 행에 이어지는 값으로 간주할 수 있습니다.
4. 학년을 찾지 못하면 기본 학년 ${defaults.grade || '1'}을 사용하세요.
5. 과목을 찾지 못하면 기본 과목 ${defaults.subject || '기타'}를 사용하세요.
6. 교시가 '1교시', '1', '1차시'처럼 표시돼도 1~7 숫자로 정규화하세요.
7. 활동 탭은 활동 내용에 맞춰 일관되게 묶으세요.
8. 헤더 행, 빈 행, 교사 이름, 반 이름만 있는 행은 결과에서 제외하세요.
9. 결과는 JSON 배열만 출력하세요. 마크다운 코드블록, 설명, 문장을 붙이지 마세요.

기본값
학년: ${defaults.grade || '1'}
과목: ${defaults.subject || '기타'}

붙여 넣은 원문:
${sourceText}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.1,
          maxOutputTokens: 4000,
          responseMimeType: 'application/json'
        }
      })
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    const parsed = parseJsonArray(raw);
    if (!parsed.length) throw new Error('AI 응답에서 활동 목록을 찾지 못했습니다.');
    return res.status(200).json({ source: 'gemini', activities: parsed });
  } catch (e) {
    return res.status(200).json({
      source: 'fallback',
      activities: fallback,
      error: String(e?.message || e)
    });
  }
}

function parseJsonArray(raw) {
  let s = String(raw || '').trim();
  if (!s) return [];
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try {
    const v = JSON.parse(s);
    if (Array.isArray(v)) return v;
    if (Array.isArray(v?.activities)) return v.activities;
  } catch (_) {}
  const start = s.indexOf('['), end = s.lastIndexOf(']');
  if (start >= 0 && end > start) {
    try {
      const v = JSON.parse(s.slice(start, end + 1));
      if (Array.isArray(v)) return v;
    } catch (_) {}
  }
  return [];
}

function heuristic(text, defaults = {}) {
  const lines = String(text || '').split(/\r?\n/).map(s => s.trim()).filter(Boolean);
  const out = [];
  const days = ['월', '화', '수', '목', '금'];
  let carry = { day: '', grade: String(defaults.grade || ''), subject: String(defaults.subject || '기타') };

  for (const line of lines) {
    if (/^(요일|day|교시|period|학년|과목|활동|내용|구분)/i.test(line) && line.length < 30) continue;
    const parts = line.includes('\t') ? line.split('\t').map(s => s.trim()) : line.split(/\s{2,}|\s*\|\s*/).map(s => s.trim());
    const day = (line.match(/(^|\s)([월화수목금])(?:요일)?(?=\s|$)/)?.[2]) || '';
    if (day) carry.day = day;
    const period = (line.match(/(?:^|\s)([1-7])\s*(?:교시|차시)?(?=\s|$)/)?.[1]) || '';
    if (!period && parts.length < 4) continue;
    const grade = (line.match(/([1-3])\s*학년/) || [])[1] || carry.grade;
    const subject = inferSubject(line) || carry.subject || '기타';

    let content = '';
    if (parts.length >= 5) {
      // Try the standard five-column pattern first.
      content = parts[4] || '';
      if (parts[0]?.match(/^[월화수목금](?:요일)?$/) && parts[1]?.match(/[1-7]/) && parts[2]?.match(/[1-3]/)) {
        content = parts[4] || parts.slice(4).join(' ');
      } else {
        content = parts.slice(3).join(' ');
      }
    } else if (parts.length >= 3) {
      content = parts.slice(2).join(' ');
    } else {
      content = line.replace(/([월화수목금])(?:요일)?/g, '').replace(/[1-7]\s*(?:교시|차시)?/g, '').replace(/[1-3]\s*학년/g, '').trim();
    }
    content = content.replace(/^(사회|역사|통합사회|도덕|국어|영어|수학|과학|기술·가정|정보|체육|미술|음악)\s+/, '').trim();
    if (!carry.day || !period || !content || content.length < 2) continue;
    out.push({ day: carry.day, period, grade, subject, content, group: inferGroup(content) });
    carry.grade = grade; carry.subject = subject;
  }
  return out;
}

function inferSubject(text) {
  const subjects = ['사회','역사','통합사회','도덕','국어','영어','수학','과학','기술·가정','정보','체육','미술','음악'];
  return subjects.find(x => String(text).includes(x)) || '';
}
function inferGroup(text) {
  const t = String(text || '');
  const rules = [
    ['토론',['토론','토의','쟁점']], ['발표',['발표','프레젠테이션']], ['자료 조사',['자료 조사','조사하기','검색']],
    ['자료 분석',['자료 분석','사료 분석','그래프 분석','표 분석']], ['모둠 협력',['모둠','협력','협동']], ['프로젝트',['프로젝트','기획','제작','만들기']],
    ['퀴즈',['퀴즈','문제 풀이']], ['글쓰기',['서술','논술','글쓰기','작성']], ['체험·실습',['체험','실습','실험','활동지']]
  ];
  for (const [g, words] of rules) if (words.some(w => t.includes(w))) return g;
  return '기본 활동';
}
