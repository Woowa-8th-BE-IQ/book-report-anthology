package com.iq.anthology.web;

import jakarta.servlet.http.Cookie;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.time.Duration;
import java.util.Arrays;
import org.springframework.http.HttpHeaders;
import org.springframework.http.ResponseCookie;
import org.springframework.stereotype.Component;

/**
 * 문집별 참여자 토큰 쿠키. 계정 없이 "이 브라우저는 이 문집의 누구"인지 기억한다.
 *
 * <p>SameSite=Lax라서 다른 사이트에서 보낸 POST에는 쿠키가 실리지 않는다(CSRF 완화).
 */
@Component
public class ContributorCookies {

    private static final String PREFIX = "ab_";
    private static final Duration MAX_AGE = Duration.ofDays(180);

    public String read(HttpServletRequest request, String code) {
        if (request.getCookies() == null) {
            return null;
        }
        String name = PREFIX + code;
        return Arrays.stream(request.getCookies())
                .filter(cookie -> cookie.getName().equals(name))
                .map(Cookie::getValue)
                .findFirst()
                .orElse(null);
    }

    public void write(HttpServletRequest request, HttpServletResponse response, String code, String token) {
        ResponseCookie cookie = ResponseCookie.from(PREFIX + code, token)
                .path("/")
                .httpOnly(true)
                .secure(request.isSecure())
                .sameSite("Lax")
                .maxAge(MAX_AGE)
                .build();
        response.addHeader(HttpHeaders.SET_COOKIE, cookie.toString());
    }
}
