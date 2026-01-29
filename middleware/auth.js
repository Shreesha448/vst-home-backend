import jwt from 'jsonwebtoken';

// Session storage (in production, use Redis or database)
const sessions = new Map();

// Generate session token
export function generateSessionToken(user) {
  const payload = {
    userId: user.id,
    email: user.email,
    name: user.name,
    iat: Math.floor(Date.now() / 1000),
    exp: Math.floor(Date.now() / 1000) + (24 * 60 * 60), // 24 hours
  };
  
  return jwt.sign(payload, process.env.JWT_SECRET || 'your-secret-key');
}

// Verify session token
export function verifySessionToken(token) {
  try {
    return jwt.verify(token, process.env.JWT_SECRET || 'your-secret-key');
  } catch (error) {
    return null;
  }
}

// Authentication middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];
  
  if (!token) {
    return res.status(401).json({ error: 'Access token required' });
  }
  
  const decoded = verifySessionToken(token);
  if (!decoded) {
    return res.status(403).json({ error: 'Invalid or expired token' });
  }
  
  req.user = decoded;
  next();
}

// Store user session
export function storeSession(userId, sessionData) {
  sessions.set(userId, {
    ...sessionData,
    createdAt: Date.now(),
    lastAccessed: Date.now(),
  });
}

// Get user session
export function getSession(userId) {
  const session = sessions.get(userId);
  if (session) {
    session.lastAccessed = Date.now();
    return session;
  }
  return null;
}

// Remove user session
export function removeSession(userId) {
  return sessions.delete(userId);
}

// Clean expired sessions
export function cleanExpiredSessions() {
  const now = Date.now();
  const expiredThreshold = 24 * 60 * 60 * 1000; // 24 hours
  
  for (const [userId, session] of sessions.entries()) {
    if (now - session.lastAccessed > expiredThreshold) {
      sessions.delete(userId);
    }
  }
}

// Auto-cleanup every hour
setInterval(cleanExpiredSessions, 60 * 60 * 1000);
