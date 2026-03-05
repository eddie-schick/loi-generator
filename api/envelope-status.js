import docusign from 'docusign-esign';

function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = rest.join('=');
  });
  return cookies;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parseCookies(req.headers.cookie);
  const accessToken = cookies.ds_access_token;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated with DocuSign' });
  }

  const { envelopeId } = req.query;

  if (!envelopeId) {
    return res.status(400).json({ error: 'Missing envelopeId parameter' });
  }

  try {
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DOCUSIGN_BASE_URL);
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);
    const envelope = await envelopesApi.getEnvelope(process.env.DOCUSIGN_ACCOUNT_ID, envelopeId);

    res.status(200).json({
      envelopeId: envelope.envelopeId,
      status: envelope.status,
      statusChangedDateTime: envelope.statusChangedDateTime,
      sentDateTime: envelope.sentDateTime,
      completedDateTime: envelope.completedDateTime,
    });
  } catch (error) {
    console.error('Envelope status error:', error);

    if (error.response?.statusCode === 401) {
      return res.status(401).json({ error: 'DocuSign token expired. Please reconnect.' });
    }

    res.status(500).json({ error: 'Failed to get envelope status', details: error.message });
  }
}
