import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL || 'https://placeholder.supabase.co';
// In the browser, SUPABASE_SERVICE_ROLE_KEY is undefined, so we fallback to the anon key.
// If neither is present (e.g., config error), we provide a dummy string to prevent Next.js from crashing the entire page render.
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'dummy_key_to_prevent_crash';

export const supabase = createClient(supabaseUrl, supabaseKey);
