export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import crypto from 'crypto';

function hmacSHA256(key, content) {
  return crypto.createHmac('sha256', key).update(content).digest();
}

function hashSHA256(content) {
  return crypto.createHash('sha256').update(content).digest('hex');
}

function buildAuth(ak, sk, service, region, host, action, version, body) {
  const now = new Date();
  const xDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
  const shortDate = xDate.slice(0, 8);

  const bodyHash = hashSHA256(body);

  const canonicalHeaders = [
    `content-type:application/json`,
    `host:${host}`,
    `x-content-sha256:${bodyHash}`,
    `x-date:${xDate}`,
    ''
  ].join('\n');

  const signedHeaders = 'content-type;host;x-content-sha256;x-date';

  const canonicalRequest = [
    'POST',
    '/',
    `Action=${action}&Version=${version}`,
    canonicalHeaders,
    signedHeaders,
    bodyHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = [
    'HMAC-SHA256',
    xDate,
    credentialScope,
    hashSHA256(canonicalRequest),
  ].join('\n');

  const kDate = hmacSHA256(sk, shortDate);
  const kRegion = hmacSHA256(kDate, region);
  const kService = hmacSHA256(kRegion, service);
  const kSigning = hmacSHA256(kService, 'request');
  const signature = crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');

  const authorization = `HMAC-SHA256 Credential=${ak}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

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

    const host = 'visual.volcengineapi.com';
    const service = 'cv';
    const region = 'cn-north-1';
    const action = 'CVProcess';
    const version = '2022-08-31';

    const body = JSON.stringify({
      req_key: 'i2i_tryon_async_v2',
      human_image: human_img,
      garment_image: garm_img,
    });

    const { xDate, bodyHash, authorization } = buildAuth(AK, SK, service, region, host, action, version, body);

    console.log('调用火山引擎换装V2...');

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

    console.log('任务ID:', data.data.task_id);
    return res.status(200).json({ success: true, predictionId: data.data.task_id });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
