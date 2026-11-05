package com.iq.anthology.web;

import static org.assertj.core.api.Assertions.assertThat;

import java.net.URI;
import java.net.URLEncoder;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.util.Map;
import java.util.stream.Collectors;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.web.server.LocalServerPort;

/**
 * 세션은 쿠키로만 잇는다. 주소에 ;jsessionid=… 가 붙으면 주소창을 복사해 나눌 때 세션 값이 함께 나간다.
 * URL 다시 쓰기는 실제 Tomcat이 하므로 MockMvc가 아니라 실제 포트로 확인한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.RANDOM_PORT,
        properties = "spring.datasource.url=jdbc:h2:mem:session;MODE=PostgreSQL;DATABASE_TO_LOWER=TRUE")
class SessionTrackingTest {

    @LocalServerPort
    private int port;

    @Test
    void 문집을_연_뒤_넘어가는_주소에_세션_값이_붙지_않는다() throws Exception {
        String form = Map.of("title", "주소 점검 문집", "bookTitle", "테스트 책", "bookAuthor", "테스트 저자", "nickname", "점검이")
                .entrySet().stream()
                .map(e -> e.getKey() + "=" + URLEncoder.encode(e.getValue(), StandardCharsets.UTF_8))
                .collect(Collectors.joining("&"));
        HttpRequest open = HttpRequest.newBuilder(URI.create("http://localhost:" + port + "/anthologies"))
                .header("Content-Type", "application/x-www-form-urlencoded")
                .POST(HttpRequest.BodyPublishers.ofString(form))
                .build();

        HttpResponse<Void> response = HttpClient.newHttpClient().send(open, HttpResponse.BodyHandlers.discarding());

        assertThat(response.statusCode()).isEqualTo(302);
        assertThat(response.headers().firstValue("Location")).get().asString()
                .contains("/anthologies/")
                .doesNotContainIgnoringCase("jsessionid");
    }
}
