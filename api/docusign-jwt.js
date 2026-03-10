import docusign from 'docusign-esign';

// In-memory token cache
let cachedToken = null;
let tokenExpiresAt = 0;

/**
 * Get a DocuSign access token via JWT Grant.
 * Caches the token and refreshes automatically when expired.
 */
export async function getDocuSignAccessToken() {
  // Return cached token if still valid (5-min buffer)
  if (cachedToken && Date.now() < tokenExpiresAt - 300_000) {
    return cachedToken;
  }

  const isDemo = process.env.DOCUSIGN_BASE_URL?.includes('demo');
  const oauthHost = isDemo ? 'account-d.docusign.com' : 'account.docusign.com';

  const apiClient = new docusign.ApiClient();
  apiClient.setOAuthBasePath(oauthHost);

  // Parse RSA key for JWT auth
  const rsaKey = process.env.DOCUSIGN_RSA_PRIVATE_KEY.split(String.fromCharCode(92) + "n").join(String.fromCharCode(10));

  const results = await apiClient.requestJWTUserToken(
    process.env.DOCUSIGN_CLIENT_ID,
    process.env.DOCUSIGN_USER_ID,
    ['signature', 'impersonation'],
    rsaKey,
    3600
  );

  cachedToken = results.body.access_token;
  tokenExpiresAt = Date.now() + results.body.expires_in * 1000;

  return cachedToken;
}

/**
 * Get a configured DocuSign ApiClient with a valid JWT token.
 */
export async function getDocuSignClient() {
  const accessToken = await getDocuSignAccessToken();
  const apiClient = new docusign.ApiClient();

  // Ensure base path ends with /restapi (required by the SDK)
  let basePath = process.env.DOCUSIGN_BASE_URL;
  if (basePath && !basePath.endsWith('/restapi')) {
    basePath = basePath.replace(/\/+$/, '') + '/restapi';
  }


  apiClient.setBasePath(basePath);
  apiClient.addDefaultHeader('Authorization', `Bearer ${accessToken}`);
  return apiClient;
}
