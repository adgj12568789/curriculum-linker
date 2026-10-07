export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { grade, subject, date, week, code, standard, content, activity, overlappingActivities=[] } = req.body || {};

  const clean = (v) => String(v || '')
    .replace(/\b\d+\s*\/\s*\d+\b/g, '')
    .replace(/시수\s*\/\s*누계/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/(\d{1,2})\s+세기/g, '$1세기')
    .replace(/([12])\s+차/g, '$1차')
    .replace(/중\s+심/g, '중심')
    .replace(/전\s+반/g, '전반')
    .replace(/영\s+향/g, '영향')
    .replace(/이\s+해/g, '이해')
    .replace(/탐\s+구/g, '탐구')
    .replace(/분\s+석/g, '분석')
    .replace(/비\s+교/g, '비교')
    .replace(/변\s+화/g, '변화')
    .replace(/대\s+응/g, '대응')
    .replace(/노\s+력/g, '노력')
    .replace(/인\s+권/g, '인권')
    .replace(/평\s+화/g, '평화')
    .replace(/국\s+가/g, '국가')
    .replace(/\s+([,.!?])/g, '$1')
    .replace(/\s*·\s*/g, '·')
    .replace(/\s+/g, ' ')
    .trim();

  const safeStandard = clean(standard).replace(/^\[[^\]]+\]\s*/, '');
  const safeContent = clean(content);
  const safeActivity = clean(activity);
  const safeActivities = Array.isArray(overlappingActivities)
    ? overlappingActivities.map(a => ({ date:a.date,start:a.start,end:a.end,group:a.group,content:clean(a.content),overlap:a.overlap }))
    : [];

  if (!safeStandard) return res.status(400).json({ message: '성취기준 정보가 없습니다.' });
  if (!safeActivity) return res.status(400).json({ message: '활동 정보가 없습니다.' });

  // Gemini를 사용할 수 없을 때도 교과연계 문장을 비워 두지 않습니다.
  // 활동의 핵심 행위/소재에서 교과 개념으로 연결하는 보수적인 휴리스틱을 사용합니다.
  function fallbackLinkage() {
    const a = safeActivity;
    const s = safeStandard;
    const c = safeContent;
    const isHistory = /역사/.test(subject || '') || /^\d*\s*역/.test(code || '');

    if (/이동|버스|여객선|선박|항구|항만|승선|기차|철도|교통|항로|비행|배편/.test(a)) {
      if (/세계 대전|전쟁|세계 질서/.test(s)) return '이동과 수송에 사용되는 교통수단의 변화를 살펴보며 교통·수송 기술의 발달이 세계 대전의 전개와 세계 질서 변화에 미친 영향을 이해한다.';
      if (/제국주의|침략|국가 건설/.test(s)) return '이동과 수송에 사용되는 교통수단의 변화를 살펴보며 교통망의 발달이 국가 간 교류와 제국주의적 팽창에 미친 영향을 탐색한다.';
      if (/세계화|교류/.test(s)) return '교통수단과 이동 환경의 변화를 살펴보며 사람과 물자의 이동 확대가 지역 간 교류와 세계화에 미친 영향을 탐색한다.';
      return '교통수단과 이동 환경의 변화를 살펴보며 이동 기술의 발달이 사회 변화에 미친 영향을 탐색한다.';
    }
    if (/4·?3|평화공원|평화|인권|기념관|추모|민주/.test(a)) {
      if (/인권|평화|전쟁 범죄/.test(s)) return '평화와 인권을 기억하고 성찰하는 활동을 통해 전쟁과 폭력이 인간의 삶에 미친 영향을 생각하고 평화를 위한 노력의 중요성을 탐색한다.';
      if (/민주주의|민족 운동|국가/.test(s)) return '역사적 사건을 기억하고 성찰하는 과정을 통해 시민의 권리와 민주주의의 발전이 이루어진 과정을 탐색한다.';
      return '역사적 사건을 기억하고 성찰하는 활동을 통해 평화와 인권의 중요성을 생각해본다.';
    }
    if (/박물관|과학|기술|AI|로봇|무드등|기계|발명/.test(a)) {
      if (/산업화|산업|기술|사회/.test(s)) return '기술과 발명의 변화를 체험하며 기술 발전이 생산 방식과 인간의 생활, 사회 변화에 미친 영향을 탐색한다.';
      if (/세계 대전|전쟁/.test(s)) return '기술의 발달과 활용 사례를 살펴보며 과학기술의 발전이 전쟁의 양상과 사회 변화에 미친 영향을 탐색한다.';
      return '기술의 발전 과정을 살펴보며 과학기술의 발달이 인간의 생활과 사회에 미친 영향을 탐색한다.';
    }
    if (/시장|마켓|상점|쇼핑|교역|무역|항구/.test(a)) {
      if (/산업화|제국주의|교역|국가/.test(s)) return '시장과 교역 활동을 살펴보며 물자와 사람의 이동 확대가 지역 간 교류와 사회 변화에 미친 영향을 탐색한다.';
      return '시장과 교역 활동을 살펴보며 사람과 물자의 이동이 사회와 지역 간 관계에 미친 영향을 탐색한다.';
    }
    if (/동물|생태|정원|환경|자연/.test(a)) {
      if (/생태|환경|산업화|세계화/.test(s)) return '자연과 생태 환경을 관찰하며 인간의 활동과 사회 변화가 환경에 미친 영향을 생각해본다.';
    }
    if (/식사|중식|석식|조식|음식|식당|카페/.test(a)) {
      if (/사회|문화|국가|세계화|교류/.test(s)) return '식생활과 음식 문화를 살펴보며 지역과 시대에 따른 생활 모습의 차이와 문화 교류의 영향을 탐색한다.';
    }
    if (/숙소|생활|공동체|규칙/.test(a)) {
      if (/사회|국가|공동체|민주주의|정치/.test(s)) return '공동생활에서의 규칙과 역할을 돌아보며 공동체의 질서와 구성원의 책임이 형성되는 과정을 탐색한다.';
    }
    if (isHistory) return `${a} 활동을 통해 ${c || s}과 관련된 역사적 맥락을 살펴보고, 일상 경험과 역사적 변화의 관계를 생각해본다.`;
    return `${a} 활동을 통해 ${c || '교과의 핵심 개념'}을(를) 구체적으로 살펴보고, 실제 생활과 교과 내용의 관계를 생각해본다.`
      .replace(/\(을\) /g, '(를) ');
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const linkage = fallbackLinkage();
    return res.status(200).json({ source:'fallback', canLink:true, reason:'Gemini API 키가 없어 규칙 기반으로 교과연계를 작성했습니다.', linkage });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `당신은 대한민국 중학교 교사의 '교과연계 계획' 작성 AI입니다.

목표: 교사가 입력한 실제 활동을 학교 교과의 성취기준과 최대한 자연스럽게 연결하세요. 직접적인 공통어가 없더라도, 활동의 행위나 소재에서 출발해 성취기준의 역사적·사회적 의미로 이어지는 '한 단계의 개념적 연결' 또는 '두 단계 이내의 합리적 연결'을 적극적으로 찾아야 합니다.

[매우 중요: 계획서 정보 분리]
- [성취기준]에는 오직 성취기준 문장만 사용합니다.
- '교수학습 활동 및 수업 방법'의 프로젝트 수업, 강의식 수업, 모둠 협력 수업 등은 성취기준이 아닙니다.
- '평가 방법 및 수업-평가 연계의 주안점'의 동료 평가, 관찰 평가, 자기 평가, 형성 평가, 수행평가 연계 등은 성취기준이 아닙니다.
- '시수/누계'의 1/20, 2/22 같은 숫자는 사용하지 않습니다.
- 성취기준 코드도 최종 문장에 쓰지 않습니다.

[입력]
학년: ${grade}
과목: ${subject}
날짜: ${date}
주차: ${week}
성취기준 코드: ${code || ''}
성취기준: ${safeStandard}
교과 내용(단원/소단원): ${safeContent}
실제 활동: ${safeActivity}
같은 교시의 다른 일정 후보: ${JSON.stringify(safeActivities)}

[작성 원칙]
1. 활동에서 출발해 교과 내용으로 연결합니다.
2. 활동이 '이동'이라면 단순히 이동을 반복하지 말고 교통·수송·교류·공간 이동·기술 변화 등 교과와 연결 가능한 핵심 개념을 찾아 연결합니다. 예: '이동 수단의 변화가 세계 대전에 미친 영향에 대해 이해한다.'와 같은 방향을 적극 활용할 수 있습니다.
3. 활동이 여행, 관람, 체험, 식사, 시장, 박물관, 평화공원 등이라도 교과와 연결 가능한 의미가 있다면 적극적으로 연결합니다.
4. 단, 활동에 전혀 없는 구체적 사실을 마치 실제로 체험한 것처럼 만들어내지는 않습니다. '살펴본다', '생각해본다', '탐색한다', '이해한다'처럼 교육적으로 타당한 수준의 연결을 사용합니다.
5. 성취기준의 핵심 명사와 동사(예: 파악한다, 분석한다, 탐구한다, 비교한다, 평가한다)를 활용하되 문장을 성취기준 복사문처럼 만들지 않습니다.
6. 교수학습 방법·평가 방법·평가 연계 표현은 제외합니다.
7. '성취기준을 바탕으로', '실제 수업 활동과 연결한다', '교과 내용을 이해한다' 같은 메타 표현은 쓰지 않습니다.
8. 1문장, 대체로 45~100자 정도로 작성합니다.
9. 맞춤법, 띄어쓰기, 조사, 문장 호응을 마지막에 검수합니다.
10. 연계가 약하다고 바로 거절하지 말고, '활동의 소재 → 교과 개념 → 성취기준의 의미' 순서로 연결할 수 있는지 먼저 충분히 탐색합니다.
11. 정말 아무런 교과적 연결도 만들 수 없는 경우에만 canLink=false를 사용합니다. 그 경우에도 가장 가까운 교과적 관점을 짧게 제시합니다.

[문체 예시]
- 여객선 승선 등 일상 속 안전수칙 준수 과정을 통해 법의 질서 유지 기능과 목적을 탐색한다.
- 독서를 통해 평화와 인권의 중요성에 대해 생각해본다.
- 청산도 일대를 답사하며 고령화 등 인구 유출 지역의 특징과 문제점을 현장에서 분석한다.
- AI·로봇 기술 체험을 통해 기술 발전에 따른 개인정보와 인권 보호의 중요성을 이해하고, 기본권 보장과 제한의 필요성을 탐구한다.
- 공동체 생활에서 지켜야 할 규칙과 구성원의 책임을 이해하고, 안전한 공동체를 위한 정치의 역할과 민주적 의사결정의 필요성을 탐색한다.
- 시민 혁명으로 확대된 시민의 권리와 책임을 이해하고, 공동체의 안전과 질서를 위한 시민의 역할을 탐색하며 미래 사회의 변화를 생각한다.
- 교통수단의 변화와 극지 항로의 가치를 살펴보며 극지방의 지리적 중요성을 탐색한다.
- 버스 이동 중 육상·해상 교역로 변화를 비교하며 오스만 성장과 유럽의 변화를 이해한다.

JSON 하나만 출력:
{"canLink":true/false,"reason":"연결에 사용한 핵심 관점을 짧게","linkage":"최종 교과연계 문장"}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{temperature:0.35,maxOutputTokens:350,responseMimeType:'application/json'}
      })
    });
    if(!r.ok) throw new Error(await r.text());
    const data = await r.json();
    let text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || '{}';
    text = text.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    const obj = JSON.parse(text);
    let linkage = clean(obj.linkage || '');
    // 메타 문장·평가 문구가 혹시 섞여 나오면 제거합니다.
    linkage = linkage
      .replace(/^(?:성취기준을 바탕으로|교과 내용을 이해하고|실제 수업 활동과 연결하여)\s*/,'')
      .replace(/\s*☞\s*.*$/,'')
      .replace(/(?:프로젝트|강의식|모둠 협력|개별학습|토의토론|퀴즈 활용)[^.]*(?:수업|평가)?/g,'')
      .trim();
    const canLink = linkage.length > 0;
    return res.status(200).json({
      source:'gemini', canLink,
      reason:clean(obj.reason || '활동의 핵심 소재를 교과 개념과 연결해 작성했습니다.'),
      linkage:canLink ? linkage : fallbackLinkage()
    });
  } catch(e) {
    const linkage = fallbackLinkage();
    return res.status(200).json({
      source:'fallback', canLink:true,
      reason:'Gemini 응답을 사용할 수 없어 규칙 기반 교과연계 문장을 작성했습니다.',
      linkage, error:String(e.message || e)
    });
  }
}
