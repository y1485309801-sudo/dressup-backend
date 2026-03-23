export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const REPLICATE_TOKEN = process.env.REPLICATE_TOKEN;
  if (!REPLICATE_TOKEN) return res.status(500).json({ error: 'Missing API token' });

  try {
    const { human_img, garm_img } = req.body;
    if (!human_img || !garm_img) return res.status(400).json({ error: '缺少图片参数' });

    async function uploadToReplicate(base64Str) {
      if (base64Str.startsWith('http')) return base64Str;

      // 解析 base64
      const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let buffer, mimeType;
      if (matches) {
        mimeType = matches[1];
        buffer = Buffer.from(matches[2], 'base64');
      } else {
        buffer = Buffer.from(base64Str, 'base64');
        mimeType = 'image/jpeg';
      }

      console.log('上传图片，大小:', buffer.length, 'bytes, 类型:', mimeType);

      const uploadRes = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': mimeType,
        },
        body: buffer
      });

      const text = await uploadRes.text();
      console.log('上传响应:', text);

      let uploadData;
      try { uploadData = JSON.parse(text); } catch(e) { throw new Error('上传响应解析失败: ' + text); }

      if (!uploadData.urls?.get) throw new Error('图片上传失败: ' + text);
      return uploadData.urls.get;
    }

    console.log('上传人物图片...');
    const humanUrl = await uploadToReplicate(human_img);
    console.log('人物图片URL:', humanUrl);

    console.log('上传衣服图片...');
    const garmentUrl = await uploadToReplicate(garm_img);
    console.log('衣服图片URL:', garmentUrl);

    const startRes = await fetch('https://api.replicate.com/v1/models/cuuupid/idm-vton/predictions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${REPLICATE_TOKEN}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        input: {
          human_img: humanUrl,
          garm_img: garmentUrl,
          garment_des: 'clothing item',
          is_checked: true,
          is_checked_crop: false,
          denoise_steps: 30,
          seed: 42
        }
      })
    });

    const prediction = await startRes.json();
    console.log('预测启动:', prediction.id, prediction.status);
    if (prediction.error) throw new Error(prediction.error);

    return res.status(200).json({ success: true, predictionId: prediction.id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message || '启动失败' });
  }
}
