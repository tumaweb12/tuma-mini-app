# Tuma Authentication System

## Overview

The Tuma web app now includes a complete authentication system that allows users to sign in and access role-specific pages. The system is built using Supabase for authentication and includes a clean, mobile-friendly login interface.

## Files Added/Modified

### New Files
- `index.html` - Main authentication page (login/signup)
- `auth-guard.js` - Authentication guard for protected pages

### Modified Files
- `agent.html` - Added authentication guard
- `rider.html` - Added authentication guard  
- `vendor.html` - Added authentication guard

## How It Works

### 1. Authentication Flow
1. Users visit any page (e.g., `agent.html`)
2. If not authenticated, they're redirected to `index.html`
3. Users can sign in or create a new account
4. After successful authentication, they're redirected to their role-appropriate page
5. If they were trying to access a specific page, they're redirected back to that page

### 2. User Roles
- **Agent** - Redirected to `agent.html`
- **Rider** - Redirected to `rider.html`
- **Vendor** - Redirected to `vendor.html`
- **Customer** - Redirected to `agent.html` (default)

### 3. Authentication Features
- ✅ Email/password login
- ✅ User registration with role selection
- ✅ Session management with Supabase
- ✅ Automatic session verification
- ✅ Role-based access control
- ✅ Mobile-friendly design
- ✅ Redirect handling for deep links
- ✅ Sign out functionality

## Usage

### For Users
1. Visit the web app
2. If not logged in, you'll see the login page
3. Sign in with your email/password or create a new account
4. Select your role during signup
5. You'll be redirected to the appropriate page for your role

### For Developers

#### Adding Authentication to New Pages
```html
<!-- Add these scripts to any page that requires authentication -->
<script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js"></script>
<script src="./config.js"></script>
<script type="module" src="./auth-guard.js"></script>
```

#### Checking Authentication in JavaScript
```javascript
// Check if user is authenticated
if (window.getCurrentUser()) {
    const user = window.getCurrentUser();
    console.log('User:', user.email, 'Role:', user.role);
}

// Check specific role
if (window.hasRole('agent')) {
    // Show agent-specific features
}

// Require specific role (redirects if not)
if (window.requireRole('rider')) {
    // This code only runs for riders
}
```

#### Sign Out
```javascript
// Sign out user
window.signOut();
```

## Configuration

### Supabase Setup
The authentication system uses the existing Supabase configuration in `config.js`:
- URL: `https://btxavqfoirdzwpfrvezp.supabase.co`
- Anon Key: Already configured

### Database Requirements
The system expects a `profiles` table with the following structure:
```sql
CREATE TABLE profiles (
    id UUID REFERENCES auth.users(id) PRIMARY KEY,
    email TEXT,
    full_name TEXT,
    phone TEXT,
    role TEXT DEFAULT 'customer',
    created_at TIMESTAMP DEFAULT NOW()
);
```

## Security Features

- ✅ Session verification on page load
- ✅ Automatic sign out on session expiry
- ✅ Role-based access control
- ✅ Secure token storage in localStorage
- ✅ CSRF protection through Supabase
- ✅ Input validation and sanitization

## Mobile Optimization

- ✅ Responsive design for all screen sizes
- ✅ Touch-friendly interface
- ✅ Mobile-optimized form inputs
- ✅ Fast loading and smooth animations
- ✅ PWA-ready with proper meta tags

## Testing

### Test the Authentication Flow
1. Visit `agent.html` directly - should redirect to login
2. Create a new account with role "Agent"
3. Should be redirected to `agent.html`
4. Try visiting `rider.html` - should redirect to `agent.html` (wrong role)
5. Sign out and sign in with different role
6. Should be redirected to correct page

### Test Deep Links
1. Visit `rider.html` while not logged in
2. Should redirect to login with redirect parameter
3. After login, should return to `rider.html`

## Troubleshooting

### Common Issues
1. **"Session verification failed"** - User needs to sign in again
2. **"Invalid role"** - User role not set in database
3. **"Redirect loop"** - Check that auth-guard.js is properly loaded

### Debug Mode
Open browser console to see authentication logs:
- Session verification status
- User role information
- Redirect attempts
- Error messages

## Future Enhancements

- [ ] Password reset functionality
- [ ] Two-factor authentication
- [ ] Social login (Google, Facebook)
- [ ] Remember me functionality
- [ ] Session timeout warnings
- [ ] Multi-role support for users
- [ ] Admin panel for user management

---

**Ready to use!** The authentication system is now fully integrated and ready for production use.
