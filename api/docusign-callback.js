export default async function handler(req, res) {
  const { code } = req.query;

  if (!code) {
    return res.status(400).json({ error: 'Missing authorization code' });
  }

  const baseUrl = process.env.DOCUSIGN_BASE_URL?.includes('demo')
    ? 'https://account-d.docusign.com'
    : 'https://account.docusign.com';

  const credentials = Buffer.from(
    `${process.env.DOCUSIGN_CLIENT_ID}:${process.env.DOCUSIGN_CLIENT_SECRET}`
  ).toString('base64');

  try {
    const tokenResponse = await fetch(`${baseUrl}/oauth/token`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${credentials}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: new URLSearchParams({
        grant_type: 'authorization_code',
        code,
        redirect_uri: process.env.DOCUSIGN_REDIRECT_URI,
      }),
    });

    if (!tokenResponse.ok) {
      const errorBody = await tokenResponse.text();
      console.error('DocuSign token error:', errorBody);
      return res.status(400).json({ error: 'Failed to exchange authorization code' });
    }

    const tokenData = await tokenResponse.json();

    // Store access token in httpOnly cookie — never return to client
    const maxAge = tokenData.expires_in || 3600;
    const secure = process.env.NODE_ENV === 'production' ? '; Secure' : '';
    const sameSite = process.env.NODE_ENV === 'production' ? 'None' : 'Lax';

    res.setHeader('Set-Cookie', [
      `ds_access_token=${tokenData.access_token}; HttpOnly; Path=/api; Max-Age=${maxAge}; SameSite=${sameSite}${secure}`,
      `ds_refresh_token=${tokenData.refresh_token || ''}; HttpOnly; Path=/api; Max-Age=${86400 * 30}; SameSite=${sameSite}${secure}`,
    ]);

    // Redirect back to the app with success indicator
    const redirectUrl = process.env.NODE_ENV === 'production'
      ? '/?docusign=connected'
      : 'http://localhost:5173/?docusign=connected';

    res.redirect(redirectUrl);
  } catch (error) {
    console.error('DocuSign callback error:', error);
    res.status(500).json({ error: 'DocuSign authentication failed', details: error.message });
  }
}
