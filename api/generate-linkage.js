export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ message: 'Method Not Allowed' });
  const { grade, subject, date, week, code, standard, content, activity } = req.body || {};
  if (!standard && !code) return res.status(400).json({ message: '성취기준 정보가 없습니다.' });
  const fallback = `${standard || '선택된 성취기준'}을(를) 바탕으로 ${content || '교과 내용'}을(를) 이해하고, ${activity || '학습 활동'}을(를) 통해 해당 개념을 실제 자료와 연결하여 정리하도록 한다.`;
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return res.status(200).json({ source: 'fallback', linkage: fallback });
  const model = process.env.GEMINI_MODEL || 'gemini-3.8-flash';
  const prompt = `당신은 대한민국 중학교 교사의 교육과정 기록을 보조한다. 아래 정보만 근거로 '교과연계 계획'을 1~2문장, 60~100자 정도의 공적인 문체로 작성한다.\n\n규칙\n- 성취기준 코드와 성취기준 문구를 변경하거나 새로 만들지 않는다.\n- 실제 활동에 드러난 학생 수행과 교과 내용의 연결이 분명하게 보이게 한다.\n- 실제 하지 않은 활동이나 성과를 추가하지 않는다.\n- '학생은'을 반복하지 않는다.\n- 결과 문구만 출력한다.\n\n학년: ${grade}\n과목: ${subject}\n날짜: ${date}\n주차: ${week}\n성취기준 코드: ${code || '없음'}\n성취기준: ${standard || '없음'}\n교과 내용: ${content || '없음'}\n활동: ${activity || '없음'}`;
  try {
    const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(apiKey)}`;
    const r = await fetch(endpoint, { method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({contents:[{role:'user',parts:[{text:prompt}]}],generationConfig:{temperature:0.2}}) });
    if (!r.ok) throw new Error(await r.text());
    const data=await r.json();
    const text=data?.candidates?.[0]?.content?.parts?.map(p=>p.text||'').join('').trim();
    return res.status(200).json({source:'gemini',linkage:text||fallback});
  } catch (e) {
    return res.status(200).json({source:'fallback',linkage:fallback,error:String(e.message||e)});
  }
}
