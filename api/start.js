export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import { Signer } from '@volcengine/openapi';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const AK = process.env.VOLC_AK;
  const SK = process.env.VOLC_SK;
  if (!AK || !SK) return res.status(500).json({ error: 'Missing credentials' });

  try {
    const { human_img, garm_img } = req.body;
    if (!human_img || !garm_img) return res.status(400).json({ error: '缺少图片参数' });

    const body = JSON.stringify({
      req_key: 'i2i_tryon_async_v2',
      human_image: human_img,
      garment_image: garm_img,
    });

    const requestObj = {
      region: 'cn-north-1',
      method: 'POST',
      params: { Action: 'CVProcess', Version: '2022-08-31' },
      headers: { 'Content-Type': 'application/json' },
      body,
    };

    const signer = new Signer(requestObj, 'cv');
    signer.addAuthorization({ accessKeyId: AK, secretKey: SK, sessionToken: '' });

    console.log('调用火山引擎换装V2...');

    const response = await fetch('https://visual.volcengineapi.com/?Action=CVProcess&Version=2022-08-31', {
      method: 'POST',
      headers: requestObj.headers,
      body,
    });

    const data = await response.json();
    console.log('响应:', JSON.stringify(data).substring(0, 500));

    if (data.code && data.code !== 10000) throw new Error(data.message || '调用失败');
    if (!data.data?.task_id) throw new Error('未获取到任务ID: ' + JSON.stringify(data));

    console.log('任务ID:', data.data.task_id);
    return res.status(200).json({ success: true, predictionId: data.data.task_id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
