import { generateLOIPdf } from './pdf-generator.js';

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { text, dealData } = req.body;

  if (!text) {
    return res.status(400).json({ error: 'text is required' });
  }

  try {
    const pdfBase64 = await generateLOIPdf(text, dealData || {});
    const dateStr = new Date().toISOString().split('T')[0];
    const companyName = (dealData?.companyName || 'Company').replace(/\s+/g, '_');
    const filename = `SHAED_LOI_${companyName}_${dateStr}.pdf`;

    res.status(200).json({ pdfBase64, filename });
  } catch (error) {
    console.error('PDF render error:', error);
    res.status(500).json({ error: 'Failed to render PDF', details: error.message });
  }
}
