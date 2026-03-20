/**
 * Training Sessions API
 * Frontend API client for training sessions with athlete context
 */

(function() {
 'use strict';

 // Check if Supabase is available
 const isSupabaseAvailable = typeof window.supabase !== 'undefined' && window.supabase.createClient;
 let supabaseClient = null;
 if (isSupabaseAvailable && window.SUPABASE_CONFIG) {
 supabaseClient = window.supabase.createClient(
 window.SUPABASE_CONFIG.url,
 window.SUPABASE_CONFIG.anonKey
 );
 }

 /**
 * Get athlete context for logged-in user
 * Returns: { athletes_count, athletes[] }
 */
 async function getAthleteContext() {
 if (!supabaseClient) {
 console.warn('Supabase not available. Using mock data.');
 return {
 athletes_count: 0,
 athletes: []
 };
 }

 try {
 const { data: { user } } = await supabaseClient.auth.getUser();
 if (!user) {
 return {
 athletes_count: 0,
 athletes: []
 };
 }

 const { data, error } = await supabaseClient.rpc('get_athlete_context', {
 p_user_id: user.id
 });

 if (error) throw error;

 return data || {
 athletes_count: 0,
 athletes: []
 };
 } catch (error) {
 console.error('Error getting athlete context:', error);
 return {
 athletes_count: 0,
 athletes: []
 };
 }
 }

 /**
 * Get training sessions
 * @param {string|null} athleteId - Specific athlete ID, or null for default/all
 * @param {boolean} includeAll - If true and athletes_count > 1, return aggregated schedule (SCHEDULED ONLY)
 * @returns {Promise<{sessions: Array, athletes_count: number, athlete_ids: Array}>}
 * @note CONTRACT: Multi-athlete aggregation (includeAll=true) ONLY returns scheduled sessions (has_schedule=true)
 * @note All responses include has_schedule field as explicit source of truth for schedule presence
 */
 async function getTrainingSessions(athleteId = null, includeAll = false) {
 if (!supabaseClient) {
 console.warn('Supabase not available. Using mock data.');
 return {
 sessions: [],
 athletes_count: 0,
 athlete_ids: []
 };
 }

 try {
 const { data: { user } } = await supabaseClient.auth.getUser();
 if (!user) {
 return {
 sessions: [],
 athletes_count: 0,
 athlete_ids: []
 };
 }

 const { data, error } = await supabaseClient.rpc('get_training_sessions', {
 p_user_id: user.id,
 p_athlete_id: athleteId,
 p_include_all: includeAll
 });

 if (error) throw error;

 return data || {
 sessions: [],
 athletes_count: 0,
 athlete_ids: []
 };
 } catch (error) {
 console.error('Error getting training sessions:', error);
 return {
 sessions: [],
 athletes_count: 0,
 athlete_ids: []
 };
 }
 }

 /**
 * Create training session
 * @param {Object} sessionData - { athlete_id, program_name, focus?, status?, start_time?, end_time? }
 * @returns {Promise<{id: string, success: boolean}>}
 */
 async function createTrainingSession(sessionData) {
 if (!supabaseClient) {
 throw new Error('Supabase not available');
 }

 try {
 const { data: { user } } = await supabaseClient.auth.getUser();
 if (!user) {
 throw new Error('User not authenticated');
 }

 const { data, error } = await supabaseClient.rpc('create_training_session', {
 p_user_id: user.id,
 p_athlete_id: sessionData.athlete_id,
 p_program_name: sessionData.program_name,
 p_focus: sessionData.focus || null,
 p_status: sessionData.status || 'scheduled',
 p_start_time: sessionData.start_time || null,
 p_end_time: sessionData.end_time || null
 });

 if (error) throw error;

 return data;
 } catch (error) {
 console.error('Error creating training session:', error);
 throw error;
 }
 }

 /**
 * Update training session
 * @param {string} sessionId - Session ID
 * @param {Object} updates - Partial session data to update
 * @returns {Promise<{id: string, success: boolean}>}
 */
 async function updateTrainingSession(sessionId, updates) {
 if (!supabaseClient) {
 throw new Error('Supabase not available');
 }

 try {
 const { data: { user } } = await supabaseClient.auth.getUser();
 if (!user) {
 throw new Error('User not authenticated');
 }

 const { data, error } = await supabaseClient.rpc('update_training_session', {
 p_user_id: user.id,
 p_session_id: sessionId,
 p_program_name: updates.program_name || null,
 p_focus: updates.focus || null,
 p_status: updates.status || null,
 p_start_time: updates.start_time !== undefined ? updates.start_time : null,
 p_end_time: updates.end_time !== undefined ? updates.end_time : null
 });

 if (error) throw error;

 return data;
 } catch (error) {
 console.error('Error updating training session:', error);
 throw error;
 }
 }

 /**
 * Delete training session (via direct table access with RLS)
 * @param {string} sessionId - Session ID
 * @returns {Promise<boolean>}
 */
 async function deleteTrainingSession(sessionId) {
 if (!supabaseClient) {
 throw new Error('Supabase not available');
 }

 try {
 const { error } = await supabaseClient
 .from('training_sessions_v2')
 .delete()
 .eq('id', sessionId);

 if (error) throw error;

 return true;
 } catch (error) {
 console.error('Error deleting training session:', error);
 throw error;
 }
 }

 /**
 * Helper: Check if session has schedule
 * @param {Object} session - Session object
 * @returns {boolean}
 * @note has_schedule is the EXPLICIT SOURCE OF TRUTH for schedule presence
 * @note Frontend MUST use this to determine whether to render "Training Schedule" section
 */
 function hasSchedule(session) {
 // has_schedule is the explicit source of truth
 return session.has_schedule === true;
 }

 /**
 * Helper: Check if user has multiple athletes
 * @param {Object} context - Athlete context from getAthleteContext()
 * @returns {boolean}
 */
 function hasMultipleAthletes(context) {
 return context.athletes_count > 1;
 }

 /**
 * Helper: Should show "All Athletes" aggregation
 * @param {Object} context - Athlete context
 * @param {boolean} isAggregatedRequest - Is this an aggregated schedule request?
 * @returns {boolean}
 */
 function shouldShowAllAthletes(context, isAggregatedRequest) {
 return hasMultipleAthletes(context) && isAggregatedRequest;
 }

 // Export API
 window.TrainingSessionsAPI = {
 getAthleteContext,
 getTrainingSessions,
 createTrainingSession,
 updateTrainingSession,
 deleteTrainingSession,
 hasSchedule,
 hasMultipleAthletes,
 shouldShowAllAthletes
 };

 // Log initialization
 if (window.console && console.log) {
 console.log('[Training Sessions API] Initialized');
 }
})();
