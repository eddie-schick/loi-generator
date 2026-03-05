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
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const cookies = parseCookies(req.headers.cookie);
  const accessToken = cookies.ds_access_token;

  if (!accessToken) {
    return res.status(401).json({ error: 'Not authenticated with DocuSign. Please connect first.' });
  }

  const { loiText, companyName, signerEmail, signerName, personalMessage } = req.body;

  if (!loiText || !companyName || !signerEmail || !signerName) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dateStr = new Date().toISOString().split('T')[0];

  try {
    const apiClient = new docusign.ApiClient();
    apiClient.setBasePath(process.env.DOCUSIGN_BASE_URL);
    apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);

    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Determine SHAED signatory from env
    const shaedSignerEmail = process.env.SHAED_SIGNER_EMAIL;
    const shaedSignerName = process.env.SHAED_SIGNER_NAME;

    const envelope = {
      emailSubject: `LOI: SHAED Inc. × ${companyName} — Please Sign`,
      emailBlurb: personalMessage || `Please review and sign the attached Letter of Intent from SHAED Inc.`,
      documents: [{
        documentBase64: Buffer.from(loiText).toString('base64'),
        name: `SHAED_LOI_${companyName.replace(/\s+/g, '_')}_${dateStr}.txt`,
        fileExtension: 'txt',
        documentId: '1',
      }],
      recipients: {
        signers: [
          {
            email: signerEmail,
            name: signerName,
            recipientId: '1',
            routingOrder: '1',
            tabs: {
              signHereTabs: [{ anchorString: '/sig1/', anchorYOffset: '-5', anchorUnits: 'pixels' }],
              dateSignedTabs: [{ anchorString: '/date1/', anchorUnits: 'pixels' }],
              fullNameTabs: [{ anchorString: '/name1/', anchorUnits: 'pixels' }],
            },
          },
          {
            email: shaedSignerEmail,
            name: shaedSignerName,
            recipientId: '2',
            routingOrder: '2',
            tabs: {
              signHereTabs: [{ anchorString: '/sig2/', anchorYOffset: '-5', anchorUnits: 'pixels' }],
              dateSignedTabs: [{ anchorString: '/date2/', anchorUnits: 'pixels' }],
            },
          },
        ],
      },
      status: 'sent',
    };

    const envelopeDefinition = docusign.EnvelopeDefinition.constructFromObject(envelope);
    const results = await envelopesApi.createEnvelope(process.env.DOCUSIGN_ACCOUNT_ID, {
      envelopeDefinition,
    });

    res.status(200).json({
      envelopeId: results.envelopeId,
      status: results.status,
      message: 'Envelope sent successfully',
    });
  } catch (error) {
    console.error('DocuSign send error:', error);

    if (error.response?.statusCode === 401) {
      return res.status(401).json({ error: 'DocuSign token expired. Please reconnect.' });
    }

    res.status(500).json({ error: 'Failed to send DocuSign envelope', details: error.message });
  }
}
