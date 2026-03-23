import crypto from 'crypto';

function sign(secretKey, date, region, service, stringToSign) {
  const kDate = crypto.createHmac('sha256', secretKey).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
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
    const service = 'cv';
    const region = 'cn-north-1';
    const host = 'visual.volcengineapi.com';
    const action = 'CVGetResult';
    const version = '2022-08-31';

    const body = JSON.stringify({ task_id: id });

    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, '').slice(0, 15) + 'Z';
    const dateStamp = amzDate.slice(0, 8);

    const bodyHash = crypto.createHash('sha256').update(body).digest('hex');
    const canonicalHeaders = `content-type:application/json\nhost:${host}\nx-date:${amzDate}\n`;
    const signedHeaders = 'content-type;host;x-date';

    const canonicalRequest = [
      'POST',
      '/',
      `Action=${action}&Version=${version}`,
      canonicalHeaders,
      signedHeaders,
      bodyHash,
    ].join('\n');

    const credentialScope = `${dateStamp}/${region}/${service}/request`;
    const stringToSign = [
      'HMAC-SHA256',
      amzDate,
      credentialScope,
      crypto.createHash('sha256').update(canonicalRequest).digest('hex'),
    ].join('\n');

    const signature = sign(SK, dateStamp, region, service, stringToSign);
    const authorization = `HMAC-SHA256 Credential=${AK}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

    const response = await fetch(`https://${host}/?Action=${action}&Version=${version}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Host': host,
        'X-Date': amzDate,
        'Authorization': authorization,
      },
      body,
    });

    const data = await response.json();
    console.log('查询结果:', JSON.stringify(data).substring(0, 300));

    if (data.ResponseMetadata?.Error) throw new Error(data.ResponseMetadata.Error.Message);

    const result = data.Result;
    if (!result) throw new Error('无结果');

    res.setHeader('Cache-Control', 'no-store');

    if (result.Status === 'done' && result.ImageUrls?.length > 0) {
      return res.status(200).json({ status: 'succeeded', imageUrl: result.ImageUrls[0] });
    } else if (result.Status === 'failed') {
      return res.status(200).json({ status: 'failed', error: '生成失败' });
    } else {
      return res.status(200).json({ status: 'processing' });
    }

  } catch (err) {
    console.error('查询失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
