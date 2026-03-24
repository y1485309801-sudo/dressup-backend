import crypto from 'crypto';

function volcSign(ak, sk, service, region, host, action, version, body) {
  const now = new Date();
  const xDate = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const shortDate = xDate.slice(0, 8);
  const bodyHash = crypto.createHash('sha256').update(body).digest('hex');

  const canonicalRequest = [
    'POST', '/',
    `Action=${action}&Version=${version}`,
    `content-type:application/json\nhost:${host}\nx-content-sha256:${bodyHash}\nx-date:${xDate}\n`,
    'content-type;host;x-content-sha256;x-date',
    bodyHash,
  ].join('\n');

  const credentialScope = `${shortDate}/${region}/${service}/request`;
  const hashedCanonical = crypto.createHash('sha256').update(canonicalRequest).digest('hex');
  const stringToSign = `HMAC-SHA256\n${xDate}\n${credentialScope}\n${hashedCanonical}`;

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
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const AK = process.env.VOLC_AK;
  const SK = process.env.VOLC_SK;
  if (!AK || !SK) return res.status(500).json({ error: 'Missing credentials' });

  const { id } = req.query;
  if (!id) return res.status(400).json({ error: '缺少任务ID' });

  try {
    const host    = 'visual.volcengineapi.com';
    const service = 'cv';
    const region  = 'cn-north-1';
    const action  = 'CVGetResult';
    const version = '2022-08-31';

    const body = JSON.stringify({ task_id: id });
    const { xDate, bodyHash, authorization } = volcSign(AK, SK, service, region, host, action, version, body);

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
    console.log('查询:', JSON.stringify(data).substring(0, 300));

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
