import express from 'express';
import axios from 'axios';
import crypto from 'crypto';

const router = express.Router();

// Microsoft OAuth 2.0 configuration
const MS_CONFIG = {
  clientId: process.env.MS_CLIENT_ID || 'YOUR_CLIENT_ID_HERE',
  clientSecret: process.env.MS_CLIENT_SECRET || 'YOUR_CLIENT_SECRET_HERE',
  tenantId: process.env.MS_TENANT_ID || 'YOUR_TENANT_ID_HERE',
  redirectUri: process.env.MS_REDIRECT_URI || 'http://localhost:5173',
  scope: 'openid profile email User.Read Mail.Read',
};

// Store auth state temporarily (in production, use Redis)
const authStates = new Map();

// Generate Microsoft OAuth URL
router.get('/microsoft/url', (req, res) => {
  const state = crypto.randomBytes(16).toString('hex');
  const nonce = crypto.randomBytes(16).toString('hex');
  
  // Store state and nonce
  authStates.set(state, {
    nonce,
    createdAt: Date.now(),
    redirectUri: MS_CONFIG.redirectUri
  });
  
  // Clean old states (older than 10 minutes)
  const now = Date.now();
  for (const [key, value] of authStates.entries()) {
    if (now - value.createdAt > 600000) {
      authStates.delete(key);
    }
  }
  
  const authUrl = `https://login.microsoftonline.com/${MS_CONFIG.tenantId}/oauth2/v2.0/authorize?` +
    `client_id=${MS_CONFIG.clientId}&` +
    `response_type=code&` +
    `redirect_uri=${encodeURIComponent(MS_CONFIG.redirectUri)}&` +
    `scope=${encodeURIComponent(MS_CONFIG.scope)}&` +
    `state=${state}&` +
    `nonce=${nonce}&` +
    `response_mode=query`;
  
  res.json({ url: authUrl, state });
});

// Exchange authorization code for tokens
router.post('/microsoft/token', async (req, res) => {
  const { code, state } = req.body;
  
  if (!code || !state) {
    return res.status(400).json({ error: 'Missing code or state' });
  }
  
  const storedState = authStates.get(state);
  if (!storedState) {
    return res.status(400).json({ error: 'Invalid or expired state' });
  }
  
  try {
    const tokenData = new URLSearchParams({
      client_id: MS_CONFIG.clientId,
      client_secret: MS_CONFIG.clientSecret,
      code: code,
      redirect_uri: MS_CONFIG.redirectUri,
      grant_type: 'authorization_code',
      scope: MS_CONFIG.scope,
    });
    
    const response = await axios.post(
      `https://login.microsoftonline.com/${MS_CONFIG.tenantId}/oauth2/v2.0/token`,
      tokenData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const tokenResponse = response.data;
    
    // Verify ID token nonce
    if (tokenResponse.id_token) {
      const idTokenParts = tokenResponse.id_token.split('.');
      const payload = JSON.parse(Buffer.from(idTokenParts[1], 'base64').toString());
      
      if (payload.nonce !== storedState.nonce) {
        return res.status(400).json({ error: 'Invalid nonce' });
      }
    }
    
    // Get user info from Microsoft Graph
    const userInfoResponse = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${tokenResponse.access_token}`,
      },
    });
    
    const userInfo = userInfoResponse.data;
    
    // Clean up state
    authStates.delete(state);
    
    // Return user info and tokens (excluding sensitive data)
    res.json({
      user: {
        id: userInfo.id,
        name: userInfo.displayName,
        email: userInfo.mail || userInfo.userPrincipalName,
        displayName: userInfo.displayName,
        jobTitle: userInfo.jobTitle,
        department: userInfo.department,
      },
      tokens: {
        accessToken: tokenResponse.access_token,
        refreshToken: tokenResponse.refresh_token,
        expiresIn: tokenResponse.expires_in,
      },
      expiresAt: Date.now() + (tokenResponse.expires_in * 1000),
    });
    
  } catch (error) {
    console.error('Token exchange error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to exchange code for tokens',
      details: error.response?.data || error.message 
    });
  }
});

// Refresh access token
router.post('/microsoft/refresh', async (req, res) => {
  const { refreshToken } = req.body;
  
  if (!refreshToken) {
    return res.status(400).json({ error: 'Missing refresh token' });
  }
  
  try {
    const tokenData = new URLSearchParams({
      client_id: MS_CONFIG.clientId,
      client_secret: MS_CONFIG.clientSecret,
      refresh_token: refreshToken,
      grant_type: 'refresh_token',
      scope: MS_CONFIG.scope,
    });
    
    const response = await axios.post(
      `https://login.microsoftonline.com/${MS_CONFIG.tenantId}/oauth2/v2.0/token`,
      tokenData,
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );
    
    const tokenResponse = response.data;
    
    res.json({
      accessToken: tokenResponse.access_token,
      refreshToken: tokenResponse.refresh_token || refreshToken,
      expiresIn: tokenResponse.expires_in,
    });
    
  } catch (error) {
    console.error('Token refresh error:', error.response?.data || error.message);
    res.status(500).json({ 
      error: 'Failed to refresh token',
      details: error.response?.data || error.message 
    });
  }
});

// Validate token and get user info
router.get('/microsoft/validate', async (req, res) => {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing or invalid authorization header' });
  }
  
  const token = authHeader.substring(7);
  
  try {
    const response = await axios.get('https://graph.microsoft.com/v1.0/me', {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    
    res.json({
      valid: true,
      user: {
        id: response.data.id,
        name: response.data.displayName,
        email: response.data.mail || response.data.userPrincipalName,
        displayName: response.data.displayName,
      }
    });
    
  } catch (error) {
    res.status(401).json({ 
      valid: false,
      error: 'Invalid or expired token'
    });
  }
});

export default router;
