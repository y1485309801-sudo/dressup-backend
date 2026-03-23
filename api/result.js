import { Signer } from '@volcengine/openapi';

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AK = process.env.VOLC_AK;
  const SK = process.env.VOLC_SK;
  if (!AK || !SK) return res.status(500).json({ error: 'Missing credentials' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少任务ID' });

  try {
    const body = JSON.stringify({ task_id: id });

    const requestObj = {
      region: 'cn-north-1',
      method: 'POST',
      params: { Action: 'CVGetResult', Version: '2022-08-31' },
      headers: { 'Content-Type': 'application/json' },
      body,
    };

    const signer = new Signer(requestObj, 'cv');
    signer.addAuthorization({ accessKeyId: AK, secretKey: SK, sessionToken: '' });

    const response = await fetch('https://visual.volcengineapi.com/?Action=CVGetResult&Version=2022-08-31', {
      method: 'POST',
      headers: requestObj.headers,
      body,
    });

    const data = await response.json();
    console.log('查询结果:', JSON.stringify(data).substring(0, 300));

    res.setHeader('Cache-Control', 'no-store');
    if (data.code && data.code !== 10000) throw new Error(data.message);

    const result = data.data;
    if (!result) return res.status(200).json({ status: 'processing' });

    if (result.status === 'done' && result.image_urls?.length > 0) {
      return res.status(200).json({ status: 'succeeded', imageUrl: result.image_urls[0] });
    } else if (result.status === 'failed') {
      return res.status(200).json({ status: 'failed', error: '生成失败' });
    } else {
      return res.status(200).json({ status: 'processing' });
    }

  } catch (err) {
    console.error('查询失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
