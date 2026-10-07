export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { text, year = new Date().getFullYear() } = req.body || {};
  const sourceText = String(text || '').trim();
  if (!sourceText) return res.status(400).json({ message: '정리할 일정 내용이 없습니다.' });
  if (sourceText.length > 80000) return res.status(400).json({ message: '붙여 넣은 내용이 너무 깁니다. 한 번에 8만 자 이하로 입력해 주세요.' });

  const fallback = heuristic(sourceText, Number(year) || new Date().getFullYear());
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ source: 'fallback', activities: fallback });

  const model = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const prompt = `당신은 대한민국 중학교 교사가 현장학습·행사·수업 일정표를 기록용 데이터로 정리하도록 돕는 AI입니다.\n
사용자가 복사해 붙여 넣은 원문을 날짜별 시간대 일정 배열로 변환하세요. 원문에는 마크다운 표 기호, 빈 행, 굵은 글씨, '일자/시간(분)/세부 일정' 같은 헤더가 섞여 있을 수 있습니다.\n
각 일정은 다음 JSON 필드를 정확히 사용합니다.\n- date: YYYY-MM-DD\n- day: 월/화/수/목/금 중 하나\n- start: HH:MM\n- end: HH:MM 또는 빈 문자열(예: '19:00~')\n- duration: 원문 괄호 안의 분 숫자. 없으면 빈 문자열\n- content: 원문 세부 일정. 여러 줄로 이어진 같은 일정은 하나의 문장/문단으로 합칩니다. 원문 내용을 임의로 삭제하거나 새로 만들지 마세요.\n- group: 짧은 활동 탭 이름. 예: 이동, 식사, 관람, 체험, 자율활동, 숙박, 행정·이동\n
중요 규칙\n1. 날짜 헤더가 다음 날짜가 나올 때까지 이어지는 모든 시간대를 그 날짜에 귀속합니다.\n2. '10. 21.(수)'처럼 연도가 없으면 기본 연도 ${Number(year) || new Date().getFullYear()}을 사용합니다.\n3. 시간은 '09:00\\~12:00 (60)'처럼 적혀도 start='09:00', end='12:00', duration='60'으로 분리합니다.\n4. '19:00~'처럼 종료 시간이 없으면 end는 빈 문자열입니다.\n5. '제주신화테마파크 자율체험 및 중식' 다음 줄의 괄호 설명처럼 같은 시간대의 연속 설명은 content에 합칩니다.\n6. 마크다운 표의 |, --- 같은 표 문법은 제거합니다.\n7. 헤더만 있는 행은 제외합니다.\n8. 원문에 없는 교시, 학년, 과목은 만들지 않습니다. 이 단계에서는 실제 시간대 일정만 정리합니다.\n9. 결과는 JSON 배열만 출력합니다. 마크다운 코드블록이나 설명을 붙이지 마세요.\n\n원문:\n${sourceText}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.1, maxOutputTokens: 6000, responseMimeType: 'application/json' }
      })
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    const raw = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    const parsed = parseJsonArray(raw);
    if (!parsed.length) throw new Error('AI 응답에서 일정 목록을 찾지 못했습니다.');
    return res.status(200).json({ source: 'gemini', activities: sanitize(parsed, Number(year) || new Date().getFullYear()) });
  } catch (e) {
    return res.status(200).json({ source: 'fallback', activities: fallback, error: String(e?.message || e) });
  }
}

function parseJsonArray(raw) {
  let s = String(raw || '').trim();
  s = s.replace(/^```json\s*/i, '').replace(/^```\s*/i, '').replace(/\s*```$/i, '').trim();
  try { const v = JSON.parse(s); return Array.isArray(v) ? v : (Array.isArray(v?.activities) ? v.activities : []); } catch (_) {}
  const a=s.indexOf('['), b=s.lastIndexOf(']'); if(a>=0&&b>a){try{const v=JSON.parse(s.slice(a,b+1));return Array.isArray(v)?v:[];}catch(_){} }
  return [];
}

function sanitize(arr, year){
  const days=['월','화','수','목','금'];
  return arr.map(x=>({
    id:'a-'+Math.random().toString(36).slice(2,9),
    date:validDate(x.date)?x.date:'', day:days.includes(String(x.day))?String(x.day):dayFromDate(x.date),
    start:normTime(x.start),end:normTime(x.end),duration:String(x.duration||''),content:String(x.content||'').trim(),group:String(x.group||inferGroup(x.content)||'기본 활동').trim()
  })).filter(x=>x.content&&x.start&&x.date);
}
function normTime(t){const m=String(t||'').trim().match(/^(\d{1,2}):(\d{2})$/);return m?`${String(Number(m[1])).padStart(2,'0')}:${m[2]}`:''}
function validDate(d){return /^\d{4}-\d{2}-\d{2}$/.test(String(d||''))&& !Number.isNaN(new Date(String(d)+'T00:00:00').getTime())}
function dayFromDate(d){const v=new Date(String(d||'')+'T00:00:00');return Number.isNaN(v.getTime())?'': ['일','월','화','수','목','금','토'][v.getDay()]}
function inferGroup(text){const t=String(text||''); if(/이동|출발|도착|승선|이동/.test(t))return '이동'; if(/중식|석식|조식|식사|카페테리아/.test(t))return '식사'; if(/만들기|체험|실습/.test(t))return '체험'; if(/관람|박물관|공원|시장|테마파크|공연|월드/.test(t))return '관람'; if(/숙소|리조트|자유시간/.test(t))return '숙박·자유'; if(/발권/.test(t))return '행정·이동'; return '기타 활동';}

function cleanLine(s){return String(s||'').replace(/\\~/g,'~').replace(/^\s*\|\s*|\s*\|\s*$/g,'').replace(/^\*+|\*+$/g,'').trim();}
function heuristic(text, year){
  const raw=String(text||'').split(/\r?\n/).map(cleanLine).filter(Boolean).filter(x=>!/^[-|\s]+$/.test(x));
  const out=[];let date='',day='',pending=null;
  const dateRe=/^(\d{1,2})\.\s*(\d{1,2})\.?\s*\(?([월화수목금])(?:요일)?\)?$/;
  const timeRe=/(\d{1,2}:\d{2})\s*[~～-]\s*(\d{1,2}:\d{2})?\s*(?:\((\d+)\))?/;
  const push=()=>{if(!pending)return; if(pending.content&&date&&pending.start){out.push({id:'a-'+Math.random().toString(36).slice(2,9),date,day,start:pending.start,end:pending.end||'',duration:pending.duration||'',content:pending.content.trim(),group:inferGroup(pending.content)});}pending=null;};
  for(const line0 of raw){let line=line0.replace(/\((?:\s*\d+\s*)\)\s*$/,'$&');const dm=line.match(dateRe);if(dm){push();date=`${year}-${String(dm[1]).padStart(2,'0')}-${String(dm[2]).padStart(2,'0')}`;day=dm[3];continue;}const tm=line.match(timeRe);if(tm){push();pending={start:`${String(Number(tm[1].slice(0,2))).padStart(2,'0')}:${tm[1].slice(3)}`,end:tm[2]||'',duration:tm[3]||'',content:''};continue;}if(pending)pending.content=(pending.content?pending.content+' ':'')+line; }
  push();return out;
}
