package org.example.config;

import jakarta.servlet.Filter;
import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.ServletRequest;
import jakarta.servlet.ServletResponse;
import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.example.dto.UserDeviceData;
import org.example.utils.JwtUtil;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.io.IOException;
import java.util.Arrays;
import java.util.List;

@Component
public class JwtFilter implements Filter {

    @Value("${jwt.secret-key}")
    private String jwtKey;

    private static final String[] PUBLIC_URLS = {
            "/api/auth/"
    };

    @Override
    public void doFilter(ServletRequest req, ServletResponse res, FilterChain chain)
            throws IOException, ServletException {

        HttpServletRequest request = (HttpServletRequest) req;
        HttpServletResponse response = (HttpServletResponse) res;

        String path = request.getRequestURI();

        // Skip public URLs
        if (isPublicUrl(path)) {
            chain.doFilter(request, response);
            return;
        }

        String token = getTokenFromCookie(request);

        if (token != null && JwtUtil.validateToken(token, jwtKey)) {

            Long userId = JwtUtil.extractUserId(token, jwtKey);
            String phone = JwtUtil.extractPhoneNumber(token, jwtKey);
            String fullName = JwtUtil.extractFullName(token, jwtKey);
            List<UserDeviceData> userDeviceData = JwtUtil.extractDevice(token, jwtKey);
            String vpa = JwtUtil.extractVpa(token, jwtKey);

            request.setAttribute("userId", userId);
            request.setAttribute("phoneNumber", phone);
            request.setAttribute("fullname", fullName);
            request.setAttribute("userDeviceData", userDeviceData);
            request.setAttribute("vpa", vpa);

            chain.doFilter(request, response);
        } else {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.getWriter().write("Unauthorized: Invalid or Missing Token");
        }
    }

    private String getTokenFromCookie(HttpServletRequest request) {
        if (request.getCookies() == null) return null;

        return Arrays.stream(request.getCookies())
                .filter(c -> "AUTH_TOKEN".equals(c.getName()))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    private boolean isPublicUrl(String path) {
        for (String url : PUBLIC_URLS) {
            if (path.startsWith(url)) return true;
        }
        return false;
    }
}
