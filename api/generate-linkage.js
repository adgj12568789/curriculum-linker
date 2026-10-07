export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { grade, subject, date, week, code, standard, content, activity } = req.body || {};
  if (!standard && !code) return res.status(400).json({ message: '성취기준 정보가 없습니다.' });

  const clean = (v) => String(v || '')
    .replace(/\b\d+\s*\/\s*\d+\b/g, '')
    .replace(/시수\s*\/\s*누계/g, '')
    .replace(/【[^】]*】/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  const safeStandard = clean(standard);
  const safeContent = clean(content);
  const safeActivity = clean(activity);
  const fallback = `${safeActivity || '해당 활동'} 과정에서 ${safeContent || safeStandard.replace(/^\[[^\]]+\]\s*/, '').split(/[,.。]/)[0] || '교과 핵심 개념'}과 관련된 내용을 살펴보며 교과 개념의 의미를 탐색한다.`;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ source: 'fallback', linkage: fallback });

  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `당신은 대한민국 중학교 교사의 '교과연계 계획' 작성을 돕는 편집 AI입니다.
아래 정보만 근거로, 실제 학교 기록에 바로 붙여 넣을 수 있는 교과연계 문장 1개를 작성하세요.

[작성 형식]
- 예시와 같은 자연스러운 문장형 기록으로 작성합니다.
- 1문장, 약 50~100자.
- '~을 통해 ~의 중요성을 이해하고, ~을 탐색한다', '~과정을 통해 ~을 분석한다', '~을 살펴보며 ~을 생각해본다'와 같은 자연스러운 서술을 사용합니다.
- 활동에서 출발하여 교과의 핵심 개념이나 의미가 드러나도록 연결합니다.
- 학생이 실제로 한 활동을 과장하지 않습니다.
- 활동이 교과 내용과 직접 연결되지 않는 경우에도, 제공된 활동의 소재·경험 범위 안에서만 자연스럽게 연결합니다.

[반드시 제외]
- '성취기준을 바탕으로', '교과 내용을 이해하고', '실제 수업 활동과 연결하도록 한다' 같은 상투적인 문구
- 성취기준 코드 자체를 문장 안에 넣는 것
- '1/20', '2/19'처럼 시수/누계 숫자
- 수업 방법(프로젝트 수업, 강의식 수업 등), 평가 방법(동료 평가, 관찰 평가 등), 수행평가 연계 문구
- '주차', '평가영역', '수업-평가 연계의 주안점' 등의 행정 정보
- 원문에 없는 사실이나 활동
- '을(를)', '와(과)' 같은 문법 설명용 표현
- 마크다운, 따옴표, bullet

[맞춤법·띄어쓰기 검수]
- 결과를 출력하기 전에 한국어 맞춤법, 조사, 띄어쓰기, 문장 호응을 한 번 더 검수합니다.
- '20 세기', '중 심으로'처럼 PDF 추출 과정에서 생긴 불필요한 띄어쓰기를 정상적인 한국어로 복원합니다.
- 결과에는 검수된 최종 문장만 출력합니다.

학년: ${grade}
과목: ${subject}
날짜: ${date}
주차: ${week}
성취기준 코드: ${code || '없음'}
성취기준: ${safeStandard || '없음'}
교과 내용: ${safeContent || '없음'}
주요 활동: ${safeActivity || '없음'}`;

  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.15, maxOutputTokens: 220 }
      })
    });
    if (!r.ok) throw new Error(await r.text());
    const data = await r.json();
    let text = data?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('').trim() || '';
    text = text.replace(/^['"“”‘’]+|['"“”‘’]+$/g, '').replace(/\s+/g, ' ').trim();
    return res.status(200).json({ source: 'gemini', linkage: text || fallback });
  } catch (e) {
    return res.status(200).json({ source: 'fallback', linkage: fallback, error: String(e.message || e) });
  }
}
