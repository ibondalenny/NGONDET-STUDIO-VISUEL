const { createClient } = require('@supabase/supabase-js')
const ws = require('ws')

const options = { realtime: { transport: ws } }

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY,
  options
)

const supabaseAnon = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_ANON_KEY,
  options
)

module.exports = { supabase, supabaseAnon }
