/**
 * Navigation Security - Hide Calendar Link for Unauthenticated Users
 * 
 * This script checks if user is authenticated and shows/hides
 * the Calendar navigation link accordingly.
 */

document.addEventListener('DOMContentLoaded', () => {
    checkAuthAndUpdateNav();
});

async function checkAuthAndUpdateNav() {
    try {
        // Check if user is logged in (using localStorage or session)
        const isAuthenticated = checkUserAuthentication();

        // Get all calendar links in navigation
        const calendarLinks = document.querySelectorAll('a[href="calendar-preview.html"]');

        calendarLinks.forEach(link => {
            if (!isAuthenticated) {
                // Hide calendar link for public visitors
                const parentLi = link.closest('li');
                if (parentLi) {
                    parentLi.style.display = 'none';
                }
            } else {
                // Show calendar link for authenticated users
                const parentLi = link.closest('li');
                if (parentLi) {
                    parentLi.style.display = '';
                }
            }
        });
    } catch (error) {
        console.error('Error checking auth status:', error);
    }
}

function checkUserAuthentication() {
    // Check multiple auth sources

    // 1. Check localStorage for auth token
    const authToken = localStorage.getItem('authToken');
    if (authToken) return true;

    // 2. Check sessionStorage
    const sessionAuth = sessionStorage.getItem('userAuthenticated');
    if (sessionAuth === 'true') return true;

    // 3. Check for Supabase session
    const supabaseSession = localStorage.getItem('supabase.auth.token');
    if (supabaseSession) return true;

    // 4. Check for Firebase auth
    const firebaseUser = localStorage.getItem('firebase:authUser');
    if (firebaseUser) return true;

    // Default: not authenticated
    return false;
}

// Export for use in other scripts
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { checkAuthAndUpdateNav, checkUserAuthentication };
}
