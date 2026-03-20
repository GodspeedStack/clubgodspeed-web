import { createClient } from '@supabase/supabase-js';

// Supabase configuration
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
 console.error('Missing Supabase environment variables');
 throw new Error('Supabase configuration is incomplete. Please check your .env file.');
}

// Create Supabase client
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
 auth: {
 autoRefreshToken: true,
 persistSession: true,
 detectSessionInUrl: true
 }
});

/**
 * Helper function to get current user
 */
export const getCurrentUser = async () => {
 const { data: { user }, error } = await supabase.auth.getUser();
 if (error) throw error;
 return user;
};

/**
 * Helper function to check if user is a coach
 */
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

/**
 * Helper function to check if user is a parent
 */
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
