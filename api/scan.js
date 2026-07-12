// Vercel Serverless Function: 여러 병원 채용 페이지를 Gemini "URL Context" 도구로 한번에 스캔
// -------------------------------------------------
// 저장소 경로: api/scan.js (api/chat.js와 같은 폴더)
// api/chat.js와 같은 GEMINI_API_KEY 환경변수를 그대로 사용해요. 추가 설정 필요 없어요.
//
// 동작 방식: 병원 목록을 5개씩 묶어서 Gemini에게 "이 URL들 확인해서 임상병리사 공고 있으면
// JSON으로 알려줘" 라고 요청해요. url_context 도구가 각 페이지를 직접 읽어와요.
// -------------------------------------------------

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았어요' });
    return;
  }

  try {
    const { hospitals } = req.body || {};
    if (!Array.isArray(hospitals) || !hospitals.length) {
      res.status(400).json({ error: 'hospitals 배열이 필요해요' });
      return;
    }

    // 5개씩 묶어서 여러 번 요청 (한 번에 너무 많은 URL을 주면 정확도가 떨어져요)
    const batches = [];
    for (let i = 0; i < hospitals.length; i += 5) {
      batches.push(hospitals.slice(i, i + 5));
    }

    const todayStr = new Date().toISOString().slice(0, 10);
    let allResults = [];
    const errors = [];

    for (const batch of batches) {
      const urlList = batch.map((h) => `- ${h.name}: ${h.link}`).join('\n');
      const prompt =
        `오늘 날짜는 ${todayStr}야. 아래 병원들의 채용 페이지를 각각 확인해서, ` +
        `현재 지원 가능한(마감되지 않은) 임상병리사/진단검사의학과/병리과/생리과 관련 채용공고가 있는지 찾아줘.\n\n` +
        `${urlList}\n\n` +
        `반드시 순수한 JSON 배열만 출력해. 다른 설명, 인사말, 마크다운 코드블럭 기호(\`\`\`) 없이 JSON만 출력해. ` +
        `찾은 공고만 배열에 담아. 없으면 빈 배열 []만 출력해. ` +
        `각 항목은 hospital(병원명, 위 목록의 이름과 동일하게), date(공고일 또는 확인 불가시 빈 문자열, YYYY-MM-DD 형식), ` +
        `title(공고 제목), deadline(마감일, 확인 불가시 빈 문자열, YYYY-MM-DD 형식), link(해당 공고의 실제 URL, 모르면 위 병원 링크 그대로), ` +
        `memo(부서·자격요건 등을 한 줄로 요약) 필드를 가져야 해.`;

      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              tools: [{ url_context: {} }],
            }),
          }
        );

        const data = await geminiRes.json();
        if (!geminiRes.ok) {
          errors.push(data.error?.message || 'batch failed');
          continue;
        }
        let text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '[]';
        text = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
        const parsed = JSON.parse(text);
        if (Array.isArray(parsed)) allResults = allResults.concat(parsed);
      } catch (batchErr) {
        errors.push(batchErr.message);
      }
    }

    res.status(200).json({ results: allResults, errors: errors });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
