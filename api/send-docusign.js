import docusign from 'docusign-esign';
import { getDocuSignClient } from './docusign-jwt.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { loiText, pdfBase64, companyName, signerEmail, signerName, personalMessage, shaedSignatory } = req.body;

  if (!companyName || !signerEmail || !signerName || (!loiText && !pdfBase64)) {
    return res.status(400).json({ error: 'Missing required fields' });
  }

  const dateStr = new Date().toISOString().split('T')[0];

  try {
    const apiClient = await getDocuSignClient();
    const envelopesApi = new docusign.EnvelopesApi(apiClient);

    // Pick SHAED signatory based on selection
    const shaedSignerEmail = shaedSignatory === 'eddie'
      ? process.env.SHAED_SIGNER_EMAIL_SECONDARY
      : process.env.SHAED_SIGNER_EMAIL;
    const shaedSignerName = shaedSignatory === 'eddie'
      ? process.env.SHAED_SIGNER_NAME_SECONDARY
      : process.env.SHAED_SIGNER_NAME;

    // Use styled PDF if provided, otherwise fall back to plain text
    const document = pdfBase64
      ? {
          documentBase64: pdfBase64,
          name: `SHAED_LOI_${companyName.replace(/\s+/g, '_')}_${dateStr}.pdf`,
          fileExtension: 'pdf',
          documentId: '1',
        }
      : {
          documentBase64: Buffer.from(loiText).toString('base64'),
          name: `SHAED_LOI_${companyName.replace(/\s+/g, '_')}_${dateStr}.txt`,
          fileExtension: 'txt',
          documentId: '1',
        };

    const envelope = {
      emailSubject: `LOI: SHAED Inc. × ${companyName} — Please Sign`,
      emailBlurb: personalMessage || `Please review and sign the attached Letter of Intent from SHAED Inc.`,
      documents: [document],
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

    // If consent hasn't been granted yet
    if (error?.response?.body?.error === 'consent_required') {
      const isDemo = process.env.DOCUSIGN_BASE_URL?.includes('demo');
      const consentHost = isDemo ? 'account-d.docusign.com' : 'account.docusign.com';
      return res.status(400).json({
        error: 'DocuSign consent required. An admin must grant consent once.',
        consentUrl: `https://${consentHost}/oauth/auth?response_type=code&scope=signature%20impersonation&client_id=${process.env.DOCUSIGN_CLIENT_ID}&redirect_uri=${encodeURIComponent(process.env.DOCUSIGN_REDIRECT_URI)}`,
      });
    }

    res.status(500).json({ error: 'Failed to send DocuSign envelope', details: error.message });
  }
}
