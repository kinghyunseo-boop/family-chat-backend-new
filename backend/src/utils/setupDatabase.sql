-- =====================================================
-- 우리가족톡 - Supabase Database Setup
-- Supabase SQL 에디터에서 순서대로 실행하세요
-- =====================================================

-- 1. Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- PROFILES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id            UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email         TEXT UNIQUE NOT NULL,
  nickname      TEXT NOT NULL,
  avatar_url    TEXT,
  status_message TEXT DEFAULT '',
  role          TEXT NOT NULL DEFAULT 'member' CHECK (role IN ('admin', 'member')),
  is_approved   BOOLEAN NOT NULL DEFAULT false,
  is_online     BOOLEAN NOT NULL DEFAULT false,
  last_seen_at  TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Auto-update updated_at
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN NEW.updated_at = NOW(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER profiles_updated_at
  BEFORE UPDATE ON profiles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROOMS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.rooms (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name        TEXT NOT NULL,
  icon        TEXT DEFAULT '💬',
  description TEXT,
  created_by  UUID REFERENCES profiles(id),
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TRIGGER rooms_updated_at
  BEFORE UPDATE ON rooms
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- =====================================================
-- ROOM MEMBERS TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.room_members (
  id          UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id     UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  user_id     UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ DEFAULT NOW(),
  joined_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(room_id, user_id)
);

-- =====================================================
-- MESSAGES TABLE
-- =====================================================
CREATE TABLE IF NOT EXISTS public.messages (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  room_id      UUID NOT NULL REFERENCES rooms(id) ON DELETE CASCADE,
  sender_id    UUID NOT NULL REFERENCES profiles(id) ON DELETE SET NULL,
  content      TEXT NOT NULL,
  message_type TEXT NOT NULL DEFAULT 'TEXT' CHECK (message_type IN ('TEXT', 'IMAGE', 'VIDEO', 'FILE')),
  metadata     JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Index for fast room message queries
CREATE INDEX IF NOT EXISTS idx_messages_room_created ON messages(room_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_sender ON messages(sender_id);

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================

-- Enable RLS on all tables
ALTER TABLE profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE rooms ENABLE ROW LEVEL SECURITY;
ALTER TABLE room_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;

-- PROFILES policies
CREATE POLICY "profiles_select_approved" ON profiles
  FOR SELECT USING (
    auth.uid() IS NOT NULL AND
    EXISTS (SELECT 1 FROM profiles p WHERE p.id = auth.uid() AND p.is_approved = true)
  );

CREATE POLICY "profiles_update_own" ON profiles
  FOR UPDATE USING (auth.uid() = id);

-- ROOMS policies (only approved members can see rooms they belong to)
CREATE POLICY "rooms_select_members" ON rooms
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm
      JOIN profiles p ON p.id = auth.uid()
      WHERE rm.room_id = rooms.id AND rm.user_id = auth.uid() AND p.is_approved = true
    )
  );

-- ROOM_MEMBERS policies
CREATE POLICY "room_members_select" ON room_members
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND is_approved = true)
  );

CREATE POLICY "room_members_upsert_own" ON room_members
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "room_members_update_own" ON room_members
  FOR UPDATE USING (user_id = auth.uid());

-- MESSAGES policies
CREATE POLICY "messages_select_room_members" ON messages
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM room_members rm
      JOIN profiles p ON p.id = auth.uid()
      WHERE rm.room_id = messages.room_id AND rm.user_id = auth.uid() AND p.is_approved = true
    )
  );

CREATE POLICY "messages_insert_room_members" ON messages
  FOR INSERT WITH CHECK (
    sender_id = auth.uid() AND
    EXISTS (
      SELECT 1 FROM room_members WHERE room_id = messages.room_id AND user_id = auth.uid()
    )
  );

-- =====================================================
-- REALTIME (enable for messages & profiles)
-- =====================================================
ALTER PUBLICATION supabase_realtime ADD TABLE messages;
ALTER PUBLICATION supabase_realtime ADD TABLE profiles;

-- =====================================================
-- STORAGE BUCKET
-- =====================================================
-- Run in Supabase Dashboard > Storage > New Bucket
-- Name: chat-files, Public: true (or configure signed URLs for privacy)
-- Or run via API:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('chat-files', 'chat-files', true);

-- Storage policy - authenticated users can upload
-- CREATE POLICY "auth_upload" ON storage.objects FOR INSERT
--   WITH CHECK (bucket_id = 'chat-files' AND auth.uid() IS NOT NULL);
-- CREATE POLICY "public_read" ON storage.objects FOR SELECT
--   USING (bucket_id = 'chat-files');

-- =====================================================
-- SEED: Create default family room
-- =====================================================
-- INSERT INTO rooms (name, icon) VALUES ('우리가족 전체방', '🏠');
-- (Run after creating the admin user)

-- =====================================================
-- SEED: Create first admin user
-- =====================================================
-- After signing up via Supabase Auth, run:
-- UPDATE profiles SET is_approved = true, role = 'admin' WHERE email = 'your-email@example.com';
