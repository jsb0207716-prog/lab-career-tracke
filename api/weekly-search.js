export default async function handler(req, res) {
  const authHeader = req.headers['authorization'];
  if (authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'unauthorized' });
  }

  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  const GEMINI_API_KEY = process.env.GEMINI_API_KEY;

  // 검색할 병원 목록 (병원목록 탭 추가/삭제하면 여기도 같이 고쳐주세요!)
  const hospitalList = [
    { name:'한림대학교의료원', link:'https://recruit.hallym.or.kr/' },
    { name:'CHA의료원(차의과학대학교)', link:'https://recruit.chamc.co.kr/page.ckd' },
    { name:'순천향대학교부속병원', link:'https://jobapplication.schmc.ac.kr/' },
    { name:'을지대학교병원', link:'https://uemc.ac.kr/info/info_pg06_04.jsp' },
    { name:'건국대학교병원', link:'https://www.kuh.ac.kr/m/recruit/main.do' },
    { name:'이대목동병원', link:'https://mokdong.eumc.ac.kr/intro/recrut/list.do' },
    { name:'중앙대학교병원', link:'https://caumc.recruiter.co.kr/career/job' },
    { name:'경희의료원', link:'https://recruit.incruit.com/khmc/' },
    { name:'가톨릭대학교 성모병원(성모의료연합)', link:'https://www.cmcsungmo.or.kr/page/board/recruit?p=1&s=12&q=%7B%7D' },
    { name:'한양대학교병원', link:'https://hyumc.recruiter.co.kr/career/home' },
    { name:'인천성모병원', link:'https://cmcism.recruiter.co.kr/career/home' },
    { name:'고려대학교의료원', link:'https://kumc.recruiter.co.kr/career/career' },
    { name:'이대서울병원', link:'https://seoul.eumc.ac.kr/intro/recrut/list.do?bid_status=I' },
    { name:'인하대학교병원', link:'https://inhauh.recruiter.co.kr/app/jobnotice/list' },
    { name:'분당서울대학교병원', link:'https://snubh.recruiter.co.kr/app/jobnotice/list' },
    { name:'연세의료원', link:'https://yuhs.recruiter.co.kr/app/jobnotice/list' },
    { name:'서울아산병원', link:'https://recruit.amc.seoul.kr/recruit/main.do' },
    { name:'가톨릭대학교 서울성모병원', link:'https://recruit.cmcnu.or.kr/cmcseoul/index.do' },
    { name:'삼성서울병원', link:'https://www.samsunghospital.com/home/recruit/recruitInfo/recruitNotice.do' }
  ];

  const todayStr = new Date().toISOString().slice(0, 10);
  const CHUNK_SIZE = 4;
  const chunks = [];
  for (let i = 0; i < hospitalList.length; i += CHUNK_SIZE) {
    chunks.push(hospitalList.slice(i, i + CHUNK_SIZE));
  }

  function buildPrompt(chunk) {
    return chunk.map(h => {
      var domain = h.link.replace(/^https?:\/\//,'').split('/')[0];
      return `- ${h.name} (site:${domain})`;
    }).join('\n');
  }

  const systemPrompt = `너는 병원 채용정보를 찾는 도구야. 반드시 순수한 JSON 배열만 출력해. 다른 설명, 인사말, 마크다운 코드블럭(\`\`\`) 없이 JSON만 출력해. 오늘은 ${todayStr}야. 각 항목 형식: {"hospital":"병원명","date":"YYYY-MM-DD","title":"공고 제목","deadline":"YYYY-MM-DD 또는 빈 문자열","link":"검색으로 찾은 실제 공고 페이지 링크","memo":"한 줄 요약"}. 병원 하나하나 꼼꼼히 검색해봐. 지원 가능한 임상병리사/진단검사의학과 공고가 없는 병원은 결과에서 그냥 빼줘. 확실하지 않으면 빼는 게 나아.`;

  async function searchChunk(chunk) {
    const userPrompt = `아래 병원들의 채용정보를 구글에서 각각 검색해서, 현재 지원 가능한 임상병리사/진단검사의학과 공고를 찾아줘. 목록:\n` + buildPrompt(chunk);
    try {
      const geminiRes = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{ parts: [{ text: userPrompt }] }],
            systemInstruction: { parts: [{ text: systemPrompt }] },
            tools: [{ google_search: {} }]
          })
        }
      );
      const geminiData = await geminiRes.json();
      let text = geminiData?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
      text = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();
      let items = [];
      try { items = JSON.parse(text); } catch (e) { items = []; }
      if (!Array.isArray(items)) items = [];
      return { items, rawText: text };
    } catch (err) {
      return { items: [], rawText: 'ERROR: ' + String(err) };
    }
  }

  try {
    const results = await Promise.all(chunks.map(searchChunk));
    const found = results.flatMap(r => r.items);
    const debugTexts = results.map(r => r.rawText);

    await fetch(`${KV_URL}/set/last-debug`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify({
        chunkCount: chunks.length,
        foundCount: found.length,
        rawTexts: debugTexts.map(t => t.slice(0, 500)),
        ranAt: new Date().toISOString()
      })
    });

    const getRes = await fetch(`${KV_URL}/get/pending-queue`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const getData = await getRes.json();
    let existing = [];
    try { existing = getData.result ? JSON.parse(getData.result) : []; } catch (e) { existing = []; }

    const merged = existing.concat(found);

    await fetch(`${KV_URL}/set/pending-queue`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify(merged)
    });

    return res.status(200).json({ ok: true, foundThisRun: found.length, totalPending: merged.length });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
