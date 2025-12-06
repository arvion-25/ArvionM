// supabase-client.js
// ⚠️ IMPORTANT: Replace these with your actual Supabase project credentials
// You can find these in: Supabase Dashboard → Settings → API

window.SUPABASE_URL = "https://ndkticshrzlvshwqiypq.supabase.co";
window.SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ka3RpY3NocnpsdnNod3FpeXBxIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjQ5Njg5MDIsImV4cCI6MjA4MDU0NDkwMn0.twI4OQkyYUk9w91D55ha2SXOlvqb0cAkKiDx3wYxRvY";

(function initSupabase(){
  if (!window.supabase || !window.supabase.createClient) {
    console.warn('Load supabase-js before this file: <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>');
    return;
  }
  window.supabase = window.supabase.createClient(window.SUPABASE_URL, window.SUPABASE_ANON_KEY);
})();