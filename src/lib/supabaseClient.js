// Supabase client for ES module consumers (emailVerification, mfaService, etc.)
// Uses CDN-loaded supabase or window.SUPABASE_CONFIG fallback

const SUPABASE_URL = 'https://nnqokhqennuxalamnvps.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis';

let _client = null;

function getClient() {
    if (_client) return _client;
    // Prefer CDN-loaded createClient
    const createClient = window.supabase?.createClient;
    if (!createClient) {
        console.warn('supabaseClient.js: CDN supabase not loaded yet');
        return null;
    }
    _client = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
        auth: {
            autoRefreshToken: true,
            persistSession: true,
            detectSessionInUrl: true
        }
    });
    return _client;
}

// Lazy proxy so imports resolve immediately but client initialises on first use
export const supabase = new Proxy({}, {
    get(_, prop) {
        const client = getClient();
        if (!client) throw new Error('Supabase client not ready');
        return client[prop];
    }
});

export const getCurrentUser = async () => {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    return user;
};

export const isCoach = async () => {
    const user = await getCurrentUser();
    if (!user) return false;
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (error) throw error;
    return data?.role === 'coach';
};

export const isParent = async () => {
    const user = await getCurrentUser();
    if (!user) return false;
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .single();
    if (error) throw error;
    return data?.role === 'parent';
};
