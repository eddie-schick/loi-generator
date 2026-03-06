export default function handler(req, res) {
  const baseUrl = process.env.DOCUSIGN_BASE_URL?.includes('demo')
    ? 'https://account-d.docusign.com'
    : 'https://account.docusign.com';

  const authUrl = `${baseUrl}/oauth/auth?` +
    `response_type=code` +
    `&scope=signature` +
    `&client_id=${process.env.DOCUSIGN_CLIENT_ID}` +
    `&redirect_uri=${encodeURIComponent(process.env.DOCUSIGN_REDIRECT_URI)}`;

  res.redirect(authUrl);
}
