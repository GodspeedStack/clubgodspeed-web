/**
 * Environment Injector
 * Exposes Supabase config to window.SUPABASE_CONFIG for non-bundled HTML pages.
 *
 * import.meta.env only resolves inside Vite's build pipeline.
 * For plain HTML pages we fall back to hardcoded anon-level credentials.
 * Anon keys are public — access is governed by RLS policies.
 */

const SUPABASE_URL = 'https://nnqokhqennuxalamnvps.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5ucW9raHFlbm51eGFsYW1udnBzIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjY0MzcwMDYsImV4cCI6MjA4MjAxMzAwNn0.hH9XR_tgi4Xl8nS__iHwiSkwjHUvwF88491q4O27cis';

window.SUPABASE_CONFIG = { url: SUPABASE_URL, anonKey: SUPABASE_ANON_KEY };
