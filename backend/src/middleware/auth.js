const { supabaseAdmin } = require('../utils/supabase');

// Verify Supabase JWT token
const requireAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader?.startsWith('Bearer ')) {
      return res.status(401).json({ error: '인증이 필요합니다.' });
    }

    const token = authHeader.split(' ')[1];
    const { data: { user }, error } = await supabaseAdmin.auth.getUser(token);

    if (error || !user) {
      return res.status(401).json({ error: '유효하지 않은 토큰입니다.' });
    }

    // Check if user is approved
    const { data: profile } = await supabaseAdmin
      .from('profiles')
      .select('is_approved, role')
      .eq('id', user.id)
      .single();

    if (!profile?.is_approved) {
      return res.status(403).json({ error: '승인되지 않은 계정입니다. 관리자에게 문의하세요.' });
    }

    req.user = user;
    req.profile = profile;
    next();
  } catch (err) {
    next(err);
  }
};

// Admin-only middleware
const requireAdmin = (req, res, next) => {
  if (req.profile?.role !== 'admin') {
    return res.status(403).json({ error: '관리자 권한이 필요합니다.' });
  }
  next();
};

module.exports = { requireAuth, requireAdmin };
