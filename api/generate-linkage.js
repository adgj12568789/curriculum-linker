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

  // 교과연계 문장은 '활동명 + 성취기준 복사'가 아니라
  // '활동에서 발견되는 소재/행위 → 교과 개념 → 성취기준 의미'의 형태가 되도록 합니다.
  // 가능하면 50자 안팎의 한 문장으로 압축합니다.
  function fallbackLinkage() {
    const a = safeActivity;
    const s = safeStandard;

    if (/이동|버스|여객선|선박|항구|항만|승선|기차|철도|교통|항로|비행|배편/.test(a)) {
      if (/세계 대전|전쟁|세계 질서/.test(s)) return '교통수단의 변화를 살펴보며 수송 기술의 발달이 세계 대전의 전개에 미친 영향을 이해한다.';
      if (/제국주의|침략|국가 건설/.test(s)) return '교통망의 발달이 국가 간 교류와 제국주의적 팽창에 미친 영향을 탐색한다.';
      if (/세계화|교류/.test(s)) return '교통수단의 발달이 사람과 물자의 이동과 세계화에 미친 영향을 탐색한다.';
      return '교통수단의 변화를 살펴보며 이동 기술의 발달이 사회에 미친 영향을 탐색한다.';
    }
    if (/4·?3|평화공원|평화|인권|기념관|추모|민주/.test(a)) {
      if (/인권|평화|전쟁 범죄/.test(s)) return '역사적 사건을 기억하며 전쟁과 폭력이 인권과 평화에 미친 영향을 생각해본다.';
      if (/민주주의|민족 운동|국가/.test(s)) return '역사적 사건을 통해 시민의 권리와 민주주의 발전의 의미를 탐색한다.';
      return '역사적 사건을 기억하며 평화와 인권의 중요성을 생각해본다.';
    }
    if (/박물관|과학|기술|AI|로봇|무드등|기계|발명/.test(a)) {
      if (/산업화|산업|기술|사회/.test(s)) return '기술 발전이 생산 방식과 인간의 생활에 미친 영향을 탐색한다.';
      if (/세계 대전|전쟁/.test(s)) return '과학기술의 발달이 전쟁의 양상과 사회 변화에 미친 영향을 탐색한다.';
      return '과학기술의 발전이 인간의 생활과 사회에 미친 영향을 탐색한다.';
    }
    if (/시장|마켓|상점|쇼핑|교역|무역|항구/.test(a)) {
      if (/산업화|제국주의|교역|국가/.test(s)) return '교역의 확대가 국가 간 교류와 사회 변화에 미친 영향을 탐색한다.';
      return '사람과 물자의 이동이 지역 간 교류에 미친 영향을 탐색한다.';
    }
    if (/동물|생태|정원|환경|자연/.test(a) && /생태|환경|산업화|세계화/.test(s)) {
      return '인간의 활동과 사회 변화가 자연과 생태환경에 미친 영향을 생각해본다.';
    }
    if (/식사|중식|석식|조식|음식|식당|카페/.test(a) && /사회|문화|국가|세계화|교류/.test(s)) {
      return '식생활과 음식 문화를 통해 지역과 시대의 생활 모습을 탐색한다.';
    }
    if (/숙소|생활|공동체|규칙/.test(a) && /사회|국가|공동체|민주주의|정치/.test(s)) {
      return '공동생활의 규칙과 역할을 통해 공동체 질서와 책임을 탐색한다.';
    }

    // 마지막 수단도 활동명 그대로 반복하지 않고, 교과적 관점으로 압축합니다.
    if (/역사/.test(subject || '') || /^\d*\s*역/.test(code || '')) {
      if (/인권|평화|전쟁|민족|국가|제국주의|산업|냉전|세계화|교류/.test(s)) {
        return `${safeContent || '역사적 변화'}의 의미를 일상 경험과 연결하여 탐색한다.`;
      }
      return '일상 경험을 역사적 변화와 연결하여 그 의미를 탐색한다.';
    }
    return `${safeContent || '교과의 핵심 개념'}의 의미를 일상 경험과 연결하여 탐색한다.`;
  }

  function polishLinkage(value) {
    let linkage = clean(value)
      .replace(/^['"“”]+|['"“”]+$/g, '')
      .replace(/^(?:성취기준을 바탕으로|교과 내용을 이해하고|실제 수업 활동과 연결하여)\s*/,'')
      .replace(/\s*☞\s*.*$/,'')
      .replace(/\b\d+\s*\/\s*\d+\b/g, '')
      .replace(/프로젝트 수업|강의식 수업|모둠 협력 수업|에듀테크를 사용한 개별학습|토의토론 수업|퀴즈 활용 학습|동료 평가|관찰 평가|자기 평가|형성 평가|수행평가 연계/g,'')
      .replace(/\s+/g,' ')
      .trim();
    // 어색한 조사/메타 표현 방지
    linkage = linkage.replace(/\s+([,.!?])/g,'$1');
    return linkage;
  }

  function isBadLinkage(linkage) {
    if (!linkage) return true;
    if (linkage.length > 60) return true; // 50자 안팎, 최대 60자
    if (/성취기준|실제 수업 활동|교과연계|활동을 통해 .*관련된|관련된 역사적 맥락|일상 경험과 역사적 변화의 관계/.test(linkage)) return true;
    if (linkage.includes(safeActivity) && safeActivity.length >= 10) return true;
    if (linkage === safeStandard) return true;
    return false;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    const linkage = fallbackLinkage();
    return res.status(200).json({ source:'fallback', canLink:true, reason:'Gemini API 키가 없어 규칙 기반으로 교과연계를 작성했습니다.', linkage });
  }

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `당신은 대한민국 중학교 교사의 '교과연계 계획' 작성 AI입니다.

목표: 실제 활동을 성취기준의 교과적 의미와 연결한 짧고 자연스러운 한 문장을 작성합니다.

[가장 중요한 작성 규칙]
- 최종 문장은 반드시 1문장입니다.
- **50자 안팎을 최우선으로 하고, 60자를 절대 넘기지 마세요.**
- 문장은 활동의 장소나 문구를 그대로 반복하며 시작하지 마세요.
- '활동을 통해', '성취기준을 바탕으로', '실제 수업 활동과 연결하여', '관련된 역사적 맥락을 살펴보고', '일상 경험과 역사적 변화의 관계를 생각해본다' 같은 메타 문구를 쓰지 마세요.
- 가장 좋은 형태는 **[활동의 소재/행위] → [교과 개념] → [성취기준의 의미]**입니다.
- 직접적인 연관성이 약해도 포기하지 말고 한 단계 또는 두 단계의 개념적 연결을 적극적으로 찾으세요.
- 예: '완도항 이동' + '[9역06-01] 20세기 전반 세계 질서의 변화를 두 차례의 세계 대전을 중심으로 파악한다.' → '교통수단의 변화를 살펴보며 수송 기술의 발달이 세계 대전의 전개에 미친 영향을 이해한다.'
- 예: '버스 이동' + 제국주의 관련 성취기준 → '교통망의 발달이 국가 간 교류와 제국주의적 팽창에 미친 영향을 탐색한다.'
- 예: '제주 4·3평화공원' + 전쟁 범죄·인권·평화 관련 성취기준 → '역사적 사건을 기억하며 전쟁과 폭력이 인권과 평화에 미친 영향을 생각해본다.'
- 활동에 실제로 없는 사건·인물·체험을 만들어내지 마세요. 다만 활동 소재에서 합리적으로 도출되는 개념적 연결은 적극적으로 사용하세요.
- 성취기준 문장을 그대로 복사하지 말고, 핵심 개념을 재구성하여 활동과 연결하세요.
- 교수학습 방법, 평가 방법, 수행평가, 시수/누계, '프로젝트 수업·동료 평가' 등은 절대 쓰지 마세요.
- 맞춤법과 띄어쓰기를 마지막으로 검수하세요.

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

[출력 문체]
- 간결하고 교육계획서에 바로 넣을 수 있는 문장
- '-한다' 체
- 불필요한 수식어와 장소명 반복 금지
- 가능하면 40~50자 정도

JSON 하나만 출력:
{"canLink":true,"reason":"연결한 핵심 개념","linkage":"최종 교과연계 한 문장"}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, {
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({
        contents:[{role:'user',parts:[{text:prompt}]}],
        generationConfig:{temperature:0.25,maxOutputTokens:180,responseMimeType:'application/json'}
      })
    });
    if(!r.ok) throw new Error(await r.text());
    const data = await r.json();
    let text = data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim() || '{}';
    text = text.replace(/^```json\s*/i,'').replace(/```$/,'').trim();
    const obj = JSON.parse(text);
    let linkage = polishLinkage(obj.linkage || '');
    if (isBadLinkage(linkage)) linkage = fallbackLinkage();
    return res.status(200).json({
      source:'gemini', canLink:true,
      reason:clean(obj.reason || '활동의 소재와 교과 개념을 연결해 간결하게 작성했습니다.'),
      linkage
    });
  } catch(e) {
    const linkage = fallbackLinkage();
    return res.status(200).json({
      source:'fallback', canLink:true,
      reason:'Gemini 응답을 사용할 수 없어 규칙 기반으로 간결한 교과연계 문장을 작성했습니다.',
      linkage, error:String(e.message || e)
    });
  }
}
