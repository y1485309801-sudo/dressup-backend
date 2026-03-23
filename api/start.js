export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'Missing API token' });

  try {
    const { human_img, garm_img } = req.body;
    if (!human_img || !garm_img) return res.status(400).json({ error: '缺少图片参数' });

    console.log('启动换衣预测...');

    // 用版本ID调用，不用模型名
    const startRes = await fetch('https://api.replicate.com/v1/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        version: '0aee68c6e6753e4722d362678c927ff91e2e5a7fe7312dc87fb5b2ccc35b277d',
        input: {
          human_img: human_img,
          garm_img: garm_img,
          garment_des: 'clothing item',
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      })
    });

    const prediction = await startRes.json();
    console.log('预测响应:', JSON.stringify(prediction).substring(0, 300));

    if (prediction.error) throw new Error(prediction.error);
    if (!prediction.id) throw new Error('未获取到预测ID: ' + JSON.stringify(prediction));

    console.log('预测启动成功:', prediction.id);
    return res.status(200).json({ success: true, predictionId: prediction.id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
