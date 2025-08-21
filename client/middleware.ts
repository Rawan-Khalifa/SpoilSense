import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Get the pathname
  const { pathname } = request.nextUrl

  // List of protected routes
  const protectedRoutes = ['/dashboard', '/scan', '/inventory', '/recipe-suggestions']
  
  // Check if the current route is protected
  const isProtectedRoute = protectedRoutes.some(route => pathname.startsWith(route))

  if (isProtectedRoute) {
    // Check for authentication token in cookies or headers
    // Note: Firebase Auth uses httpOnly cookies when persistence is enabled
    const authToken = request.cookies.get('__session')?.value
    
    // For client-side Firebase Auth, we'll check for the Firebase Auth cookie
    // Firebase sets __session cookie when using server-side auth
    const firebaseAuthCookie = request.cookies.get('__Secure-next-auth.session-token')?.value ||
                               request.cookies.get('next-auth.session-token')?.value

    // Since Firebase Auth is primarily client-side, we'll allow the request to proceed
    // but the client components will handle the redirect if no user is authenticated
    // This prevents the flash of content while still providing server-side checks when possible
    
    // For now, we'll add security headers and let client handle auth
    const response = NextResponse.next()
    
    // Add security headers
    response.headers.set('X-Auth-Required', 'true')
    response.headers.set('X-Frame-Options', 'DENY')
    response.headers.set('X-Content-Type-Options', 'nosniff')
    response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin')
    
    return response
  }

  return NextResponse.next()
}

// Configure which routes to run middleware on
export const config = {
  matcher: [
    // Match all paths except static files, API routes, and auth routes
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$|api|login).*)',
  ],
}
