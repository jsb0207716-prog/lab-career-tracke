export default async function handler(req, res) {
  // Vercel Cron이 보낸 요청인지 확인 (보안)
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
  const systemPrompt = `너는 병원 채용정보를 찾는 도구야. 반드시 순수한 JSON 배열만 출력해. 다른 설명, 인사말, 마크다운 코드블럭(\`\`\`) 없이 JSON만 출력해. 오늘은 ${todayStr}야. 각 항목 형식: {"hospital":"병원명","date":"YYYY-MM-DD","title":"공고 제목","deadline":"YYYY-MM-DD 또는 빈 문자열","link":"공고 링크(반드시 내가 준 그 병원의 링크를 그대로 써)","memo":"한 줄 요약"}. 지원 가능한 임상병리사/진단검사의학과 공고가 없는 병원은 결과에서 그냥 빼줘.`;

  const userPrompt = `아래 병원들의 채용페이지 링크를 각각 직접 열어서 확인하고, 그래도 안 열리거나 정보가 부족하면 구글 검색을 보조로 써서, 현재 지원 가능한 임상병리사/진단검사의학과 공고를 찾아줘. 목록:\n` +
    hospitalList.map(h => `- ${h.name}: ${h.link}`).join('\n');

  try {
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: userPrompt }] }],
          systemInstruction: { parts: [{ text: systemPrompt }] },
          tools: [{ google_search: {} }, { url_context: {} }]
        })
      }
    );
      const geminiData = await geminiRes.json();
    let text = geminiData?.candidates?.[0]?.content?.parts?.map(p => p.text || '').join('') || '';
    text = text.replace(/^```json/i, '').replace(/^```/, '').replace(/```$/, '').trim();

    let found = [];
    try { found = JSON.parse(text); } catch (e) { found = []; }
    if (!Array.isArray(found)) found = [];

    // 디버그용: Gemini가 실제로 뭘 돌려줬는지 통째로 저장해둬요
    await fetch(`${KV_URL}/set/last-debug`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${KV_TOKEN}` },
      body: JSON.stringify({
        geminiHttpStatus: geminiRes.status,
        geminiOk: geminiRes.ok,
        rawText: text.slice(0, 3000),
        foundCount: found.length,
        rawGeminiResponse: JSON.stringify(geminiData).slice(0, 3000),
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
