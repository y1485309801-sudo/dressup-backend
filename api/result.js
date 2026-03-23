export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'Missing API token' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少任务ID' });

  try {
    const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
      headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` }
    });

    const result = await pollRes.json();

    if (result.status === 'succeeded' && result.output) {
      const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      return res.status(200).json({ status: 'succeeded', imageUrl: outputUrl });
    } else if (result.status === 'failed') {
      return res.status(200).json({ status: 'failed', error: result.error || '生成失败' });
    } else {
      return res.status(200).json({ status: result.status });
    }

  } catch (err) {
    console.error('查询失败:', err);
    return res.status(500).json({ error: err.message });
  }
}
