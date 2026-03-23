export default async function handler(req, res) {
  // 处理 OPTIONS 预检请求
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;
  if (!REPLICATE_TOKEN) {
    return res.status(500).json({ error: 'Missing API token' });
  }

  try {
    const { human_img, garm_img } = req.body;

    if (!human_img || !garm_img) {
      return res.status(400).json({ error: '缺少图片参数' });
    }

    // 启动 Replicate 预测
    const startRes = await fetch('https://api.replicate.com/v1/models/cuuupid/idm-vton/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          human_img,
          garm_img,
          garment_des: 'clothing item',
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      })
    });

    const prediction = await startRes.json();
    if (prediction.error) throw new Error(prediction.error);

    // 轮询等待结果（最多 90 秒）
    let result = prediction;
    let attempts = 0;

    while (result.status !== 'succeeded' && result.status !== 'failed' && attempts < 45) {
      await new Promise(r => setTimeout(r, 2000));
      attempts++;

      const pollRes = await fetch(`https://api.replicate.com/v1/predictions/${result.id}`, {
        headers: { 'Authorization': `Bearer ${REPLICATE_TOKEN}` }
      });
      result = await pollRes.json();
    }

    if (result.status === 'succeeded' && result.output) {
      const outputUrl = Array.isArray(result.output) ? result.output[0] : result.output;
      return res.status(200).json({ success: true, imageUrl: outputUrl });
    } else {
      throw new Error(result.error || '生成超时');
    }

  } catch (err) {
    console.error('换衣失败:', err);
    return res.status(500).json({ error: err.message || '换衣失败' });
  }
}
