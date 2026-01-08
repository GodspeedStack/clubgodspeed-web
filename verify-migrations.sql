-- Verify Security Migrations
-- Run this in Supabase SQL Editor to verify all tables were created

-- Check if all security tables exist
SELECT 
    tablename,
    CASE 
        WHEN tablename IN (
            'email_verification_tokens',
            'user_mfa',
            'mfa_backup_codes',
            'user_profiles',
            'rate_limiting',
            'parent_accounts'
        ) THEN '✅ EXISTS'
        ELSE '❌ MISSING'
    END as status
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename IN (
    'email_verification_tokens',
    'user_mfa',
    'mfa_backup_codes',
    'user_profiles',
    'rate_limiting',
    'parent_accounts'
)
ORDER BY tablename;

-- Check if functions exist
SELECT 
    routine_name as function_name,
    '✅ EXISTS' as status
FROM information_schema.routines
WHERE routine_schema = 'public'
AND routine_name IN (
    'generate_email_verification_token',
    'verify_email_token',
    'is_email_verified',
    'generate_mfa_backup_codes',
    'verify_mfa_backup_code',
    'enable_user_mfa',
    'disable_user_mfa',
    'is_mfa_enabled',
    'create_user_profile',
    'update_user_role',
    'get_user_role',
    'check_rate_limit',
    'record_rate_limit_attempt',
    'reset_rate_limit'
)
ORDER BY routine_name;
