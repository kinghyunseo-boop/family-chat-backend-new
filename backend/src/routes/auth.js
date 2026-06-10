const express = require('express');
const router = express.Router();
const rateLimit = require('express-rate-limit');
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// Strict rate limit for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: '로그인 시도가 너무 많습니다. 15분 후 다시 시도해 주세요.' },
});

/**
 * POST /api/auth/invite
 * Admin invites a family member (creates user in Supabase Auth)
 * Body: { email, nickname, role? }
 */
router.post('/invite', requireAuth, requireAdmin, async (req, res, next) => {
  try {
    const { email, nickname, role = 'member' } = req.body;

    if (!email || !nickname) {
      return res.status(400).json({ error: '이메일과 닉네임은 필수입니다.' });
    }

    // Create Supabase auth user (sends invite email)
    const { data: authUser, error: createError } = await supabaseAdmin.auth.admin.createUser({
      email,
      email_confirm: true,
      user_metadata: { nickname },
    });

    if (createError) {
      if (createError.message.includes('already')) {
        return res.status(409).json({ error: '이미 초대된 이메일입니다.' });
      }
      throw createError;
    }

    // Create profile
    const { error: profileError } = await supabaseAdmin.from('profiles').insert({
      id: authUser.user.id,
      email,
      nickname,
      role,
      is_approved: true,
    });

    if (profileError) throw profileError;

    // Send password reset email so they can set their password
    await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email,
      options: { redirectTo: `${process.env.FRONTEND_URL}/login` },
    });

    res.json({ message: `${nickname}님을 초대했습니다. 이메일을 확인해 주세요.` });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/auth/me
 * Get current user profile
 */
router.get('/me', requireAuth, async (req, res) => {
  const { data: profile } = await supabaseAdmin
    .from('profiles')
    .select('*')
    .eq('id', req.user.id)
    .single();
  res.json(profile);
});

/**
 * PUT /api/auth/online
 * Update online status
 */
router.put('/online', requireAuth, async (req, res, next) => {
  try {
    const { is_online } = req.body;
    await supabaseAdmin
      .from('profiles')
      .update({ is_online: !!is_online, last_seen_at: new Date().toISOString() })
      .eq('id', req.user.id);
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});

module.exports = router;
