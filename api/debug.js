export default async function handler(req, res) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;
  try {
    const r = await fetch(`${KV_URL}/get/last-debug`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const d = await r.json();
    let info = null;
    try { info = d.result ? JSON.parse(d.result) : null; } catch (e) { info = null; }
    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json(info || { message: '아직 실행 기록이 없어요' });
  } catch (err) {
    return res.status(500).json({ error: String(err) });
  }
}
