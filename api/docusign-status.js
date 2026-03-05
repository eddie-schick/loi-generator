function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  cookieHeader.split(';').forEach(cookie => {
    const [name, ...rest] = cookie.trim().split('=');
    cookies[name] = rest.join('=');
  });
  return cookies;
}

export default function handler(req, res) {
  const cookies = parseCookies(req.headers.cookie);
  const hasToken = !!cookies.ds_access_token;
  res.status(200).json({ authenticated: hasToken });
}
