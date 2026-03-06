import docusign from 'docusign-esign';
import { getDocuSignClient } from './docusign-jwt.js';

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).json({ error: 'Method not allowed' });

  const { envelopeId } = req.query;

  if (!envelopeId) {
    return res.status(400).json({ error: 'Missing envelopeId parameter' });
  }

  try {
    const apiClient = await getDocuSignClient();
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
    res.status(500).json({ error: 'Failed to get envelope status', details: error.message });
  }
}
