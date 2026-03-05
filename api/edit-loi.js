import Anthropic from '@anthropic-ai/sdk';

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { existingLOI, editInstruction } = req.body;

  if (!existingLOI || !editInstruction) {
    return res.status(400).json({ error: 'existingLOI and editInstruction are required' });
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  try {
    const response = await client.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 2500,
      system: `You are editing a Letter of Intent document for SHAED Inc.
Apply the requested change precisely.
Keep all unchanged sections exactly as they are — do not rephrase, reorder, or expand them.
Preserve all signature anchor strings (/sig1/, /sig2/, /date1/, /date2/) exactly as they appear.
Return ONLY the complete revised LOI text. No preamble, no explanation, no commentary.`,
      messages: [
        {
          role: 'user',
          content: `Here is the current Letter of Intent:\n\n${existingLOI}\n\n---\n\nPlease make this change:\n${editInstruction}\n\nReturn the complete revised LOI with only this change applied.`
        }
      ]
    });

    const revisedLOI = response.content[0].text;
    res.status(200).json({ loi: revisedLOI });

  } catch (error) {
    console.error('Edit LOI error:', error);
    res.status(500).json({ error: 'Failed to revise LOI', details: error.message });
  }
}
