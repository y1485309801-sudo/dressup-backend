export const config = {
  api: {
    bodyParser: {
      sizeLimit: '10mb',
    },
  },
};

import crypto from 'crypto';

// 火山引擎签名函数
function sign(secretKey, date, region, service, stringToSign) {
  const kDate = crypto.createHmac('sha256', secretKey).update(date).digest();
  const kRegion = crypto.createHmac('sha256', kDate).update(region).digest();
  const kService = crypto.createHmac('sha256', kRegion).update(service).digest();
  const kSigning = crypto.createHmac('sha256', kService).update('request').digest();
  return crypto.createHmac('sha256', kSigning).update(stringToSign).digest('hex');
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

    const service = 'cv';
    const region = 'cn-north-1';
    const host = 'visual.volcengineapi.com';
    const action = 'CVProcess';
    const version = '2022-08-31';

    const body = JSON.stringify({
      req_key: 'i2i_tryon_async_v2',
      human_image: human_img,
      garment_image: garm_img,
    });

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

    console.log('调用火山引擎换装V2...');

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
    console.log('响应:', JSON.stringify(data).substring(0, 300));

    if (data.ResponseMetadata?.Error) throw new Error(data.ResponseMetadata.Error.Message);
    if (!data.Result?.TaskId) throw new Error('未获取到任务ID: ' + JSON.stringify(data));

    console.log('任务ID:', data.Result.TaskId);
    return res.status(200).json({ success: true, predictionId: data.Result.TaskId });

  } catch (err) {
    console.error('启动失败:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
