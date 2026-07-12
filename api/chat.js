// Vercel Serverless Function: Gemini API 프록시 (서울 리전 고정)
// -------------------------------------------------
// 이 파일의 위치가 중요해요: 반드시 저장소 안에 "api" 폴더를 만들고
// 그 안에 이 파일을 "chat.js" 라는 이름으로 넣어야 해요.
// 즉 최종 경로: api/chat.js
//
// [배포 방법]
// 1. GitHub 저장소에 index.html과 함께 이 파일을 api/chat.js 경로로 업로드
//    (vercel.json도 저장소 최상위에 같이 업로드)
// 2. vercel.com 가입 (GitHub 계정으로 로그인 가능, 무료)
// 3. "Add New..." > "Project" > 방금 그 GitHub 저장소 선택 > Import
// 4. Deploy 누르기 전에 "Environment Variables" 펼치고 추가:
//    - Key: GEMINI_API_KEY
//    - Value: Google AI Studio(https://aistudio.google.com/apikey)에서 발급받은 키
// 5. Deploy 클릭
// 6. 배포 완료되면 프로젝트 Settings > Functions > Function Region을
//    "Seoul, South Korea (Northeast) - icn1" 로 선택 후 Save
// 7. Deployments 탭에서 최신 배포 옆 "..." > Redeploy (리전 설정을 반영하려면 재배포 필요)
// 8. 배포된 주소 뒤에 /api/chat 을 붙인 게 최종 AI_WORKER_URL이에요
//    예: https://본인프로젝트명.vercel.app/api/chat
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
    res.status(500).json({ error: 'GEMINI_API_KEY가 설정되지 않았어요 (Vercel 프로젝트 Settings > Environment Variables 확인)' });
    return;
  }

  try {
    const { system, messages } = req.body || {};

    // Gemini 형식으로 변환: assistant -> model
    const contents = (messages || []).map((m) => ({
      role: m.role === 'assistant' ? 'model' : 'user',
      parts: [{ text: m.content }],
    }));

    const geminiBody = {
      contents,
      ...(system ? { systemInstruction: { parts: [{ text: system }] } } : {}),
    };

    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      }
    );

    const data = await geminiRes.json();

    if (!geminiRes.ok) {
      res.status(geminiRes.status).json({ error: data.error?.message || 'Gemini API 오류' });
      return;
    }

    const text = data.candidates?.[0]?.content?.parts?.map((p) => p.text).join('') || '';
    res.status(200).json({ text });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
}
