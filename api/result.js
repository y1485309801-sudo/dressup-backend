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
    'POST', '/',
    `Action=${action}&Version=${version}`,
    canonicalHeaders, signedHeaders, bodyHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const stringToSign = ['HMAC-SHA256', xDate, credentialScope, hashSHA256(canonicalRequest)].join('\n');

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AK = process.env.VOLC_AK;
  const SK = process.env.VOLC_SK;
  if (!AK || !SK) return res.status(500).json({ error: 'Missing credentials' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少任务ID' });

  try {
    const host = 'visual.volcengineapi.com';
    const service = 'cv';
    const region = 'cn-north-1';
    const action = 'CVGetResult';
    const version = '2022-08-31';

    const body = JSON.stringify({ task_id: id });
    const { xDate, bodyHash, authorization } = buildAuth(AK, SK, service, region, host, action, version, body);

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
