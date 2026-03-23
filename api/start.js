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

    async function uploadToReplicate(base64Str) {
      if (base64Str.startsWith('http')) return base64Str;

      const matches = base64Str.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
      let b64data, mimeType;
      if (matches) {
        mimeType = matches[1];
        b64data = matches[2];
      } else {
        mimeType = 'image/jpeg';
        b64data = base64Str;
      }

      const buffer = Buffer.from(b64data, 'base64');
      console.log('上传图片, 大小:', buffer.length, '类型:', mimeType);

      // 用 FormData 方式上传
      const { FormData, Blob } = await import('node:buffer').catch(() => ({}));
      
      const uploadRes = await fetch('https://api.replicate.com/v1/files', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${REPLICATE_TOKEN}`,
          'Content-Type': mimeType,
          'Content-Length': String(buffer.length),
        },
        body: buffer,
        duplex: 'half',
      });

      const text = await uploadRes.text();
      console.log('上传响应状态:', uploadRes.status);
      console.log('上传响应:', text.substring(0, 200));

      let uploadData;
      try { uploadData = JSON.parse(text); } catch(e) { throw new Error('解析失败: ' + text); }
      if (!uploadData.urls?.get) throw new Error('上传失败: ' + text);
      return uploadData.urls.get;
    }

    const humanUrl = await uploadToReplicate(human_img);
    console.log('人物URL:', humanUrl);
    const garmentUrl = await uploadToReplicate(garm_img);
    console.log('衣服URL:', garmentUrl);

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
    console.log('预测:', prediction.id, prediction.status);
    if (prediction.error) throw new Error(prediction.error);

    return res.status(200).json({ success: true, predictionId: prediction.id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
