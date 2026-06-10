const express = require('express');
const router = express.Router();
const { supabaseAdmin } = require('../utils/supabase');
const { requireAuth, requireAdmin } = require('../middleware/auth');

// All admin routes require auth + admin role
router.use(requireAuth, requireAdmin);

/**
 * GET /api/admin/users
 * List all family members
 */
router.get('/users', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .select('*')
      .order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

/**
 * PATCH /api/admin/users/:id/approve
 * Approve or revoke a user
 */
router.patch('/users/:id/approve', async (req, res, next) => {
  try {
    const { is_approved } = req.body;
    const { data, error } = await supabaseAdmin
      .from('profiles')
      .update({ is_approved: !!is_approved })
      .eq('id', req.params.id)
      .select()
      .single();
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

/**
 * DELETE /api/admin/users/:id
 * Remove a family member
 */
router.delete('/users/:id', async (req, res, next) => {
  try {
    if (req.params.id === req.user.id) {
      return res.status(400).json({ error: '자기 자신을 삭제할 수 없습니다.' });
    }
    const { error } = await supabaseAdmin.auth.admin.deleteUser(req.params.id);
    if (error) throw error;
    res.json({ message: '삭제되었습니다.' });
  } catch (err) { next(err); }
});

/**
 * POST /api/admin/rooms
 * Create a chat room
 */
router.post('/rooms', async (req, res, next) => {
  try {
    const { name, icon, member_ids } = req.body;
    if (!name) return res.status(400).json({ error: '방 이름은 필수입니다.' });

    const { data: room, error: roomError } = await supabaseAdmin
      .from('rooms')
      .insert({ name, icon: icon || '💬', created_by: req.user.id })
      .select()
      .single();
    if (roomError) throw roomError;

    // Add members
    if (member_ids?.length) {
      const members = member_ids.map(uid => ({ room_id: room.id, user_id: uid }));
      await supabaseAdmin.from('room_members').insert(members);
    }

    res.json(room);
  } catch (err) { next(err); }
});

/**
 * GET /api/admin/rooms
 * List all rooms
 */
router.get('/rooms', async (req, res, next) => {
  try {
    const { data, error } = await supabaseAdmin
      .from('rooms')
      .select('*, room_members(count)')
      .order('created_at');
    if (error) throw error;
    res.json(data);
  } catch (err) { next(err); }
});

module.exports = router;
