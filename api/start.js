export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import crypto from 'crypto';

function volcSign(ak, sk, service, region, host, action, version, body) {
  const now = new Date();
  // 格式: 20210618T092822Z
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const shortDate = xDate.slice(0, 8);

  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');

  // 规范请求
  const canonicalRequest = [
    'POST',
    '/',
    `Action=${action}&Version=${version}`,
    `content-type:application/json\nhost:${host}\nx-content-sha256:${bodyHash}\nx-date:${xDate}\n`,
    'content-type;host;x-content-sha256;x-date',
    bodyHash,
  ].join('\n');

  console.log('canonicalRequest:', canonicalRequest);

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${hashedCanonical}`;

  console.log('stringToSign:', stringToSign);

  // 派生签名密钥
  const kDate    = crypto.createHmac('sha256', sk).update(shortDate).digest();
  const kRegion  = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSign    = crypto.createHmac('sha256', kService).update('request').digest();
  const signature = crypto.createHmac('sha256', kSign).update(stringToSign).digest('hex');

  const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=content-type;host;x-content-sha256;x-date, Signature=${signature}`;

  return { xDate, bodyHash, authorization };
}

export default async function handler(req, res) {
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const AK = process.env.VOLC_AK;
  const SK = process.env.VOLC_SK;
  if (!AK || !SK) return res.status(500).json({ error: 'Missing credentials' });

  try {
    const { human_img, garm_img } = req.body;
    if (!human_img || !garm_img) return res.status(400).json({ error: '缺少图片参数' });

    const host    = 'visual.volcengineapi.com';
    const service = 'cv';
    const region  = 'cn-north-1';
    const action  = 'CVProcess';
    const version = '2022-08-31';

    const body = JSON.stringify({
      req_key: 'i2i_tryon_async_v2',
      human_image: human_img,
      garment_image: garm_img,
    });

    const { xDate, bodyHash, authorization } = volcSign(AK, SK, service, region, host, action, version, body);

    console.log('Authorization:', authorization);

    const response = await fetch(`https://${host}/?Action=${action}&Version=${version}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Date': xDate,
        'X-Content-Sha256': bodyHash,
        'Authorization': authorization,
      },
      body,
    });

    const data = await response.json();
    console.log('响应:', JSON.stringify(data).substring(0, 500));

    if (data.code && data.code !== 10000) throw new Error(data.message || '调用失败');
    if (!data.data?.task_id) throw new Error('未获取到任务ID: ' + JSON.stringify(data));

    return res.status(200).json({ success: true, predictionId: data.data.task_id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
