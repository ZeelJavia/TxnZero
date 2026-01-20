package org.example.utils;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletResponse;

public class CookieUtil {

    private static final String COOKIE_NAME = "AUTH_TOKEN";

    // Set to false for local development (HTTP), true for production (HTTPS)
    private static final boolean IS_PRODUCTION = false;

    public static Cookie createJwtCookie(HttpServletResponse httpServletResponse, String token, int exTime) {
        //1. create cookie
        Cookie cookie = new Cookie(COOKIE_NAME, token);
        cookie.setHttpOnly(true);
        cookie.setSecure(IS_PRODUCTION); // Only secure in production (HTTPS)
        cookie.setPath("/");
        cookie.setMaxAge(exTime); // 1 day

        // SameSite attribute for cross-origin requests
        // For local dev with different ports, use "None" (requires Secure in production)
        // For same-origin, use "Lax" or "Strict"
        if (!IS_PRODUCTION) {
            // For local development, add SameSite=Lax via header
            httpServletResponse.setHeader("Set-Cookie",
                    String.format("%s=%s; Path=/; Max-Age=%d; HttpOnly; SameSite=Lax",
                            COOKIE_NAME, token, exTime));
        } else {
            httpServletResponse.addCookie(cookie);
        }

        return cookie;
    }

    /**
     * Clears JWT cookie (Logout)
     */
    public static Cookie clearJwtCookie(HttpServletResponse httpServletResponse) {
        //1. cookie
        Cookie cookie = new Cookie(COOKIE_NAME, "");
        cookie.setHttpOnly(true);
        cookie.setSecure(IS_PRODUCTION);
        cookie.setPath("/");
        cookie.setMaxAge(0); // ⬅️ delete immediately

        if (!IS_PRODUCTION) {
            httpServletResponse.setHeader("Set-Cookie",
                    String.format("%s=; Path=/; Max-Age=0; HttpOnly; SameSite=Lax", COOKIE_NAME));
        } else {
            httpServletResponse.addCookie(cookie);
        }

        return cookie;
    }
}
