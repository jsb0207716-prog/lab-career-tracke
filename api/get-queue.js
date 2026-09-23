export default async function handler(req, res) {
  const KV_URL = process.env.KV_REST_API_URL;
  const KV_TOKEN = process.env.KV_REST_API_TOKEN;

  try {
    const getRes = await fetch(`${KV_URL}/get/pending-queue`, {
      headers: { Authorization: `Bearer ${KV_TOKEN}` }
    });
    const getData = await getRes.json();
    let items = [];
    try { items = getData.result ? JSON.parse(getData.result) : []; } catch (e) { items = []; }

    if (items.length) {
      await fetch(`${KV_URL}/del/pending-queue`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${KV_TOKEN}` }
      });
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    return res.status(200).json({ items });
  } catch (err) {
    return res.status(500).json({ items: [], error: String(err) });
  }
}
