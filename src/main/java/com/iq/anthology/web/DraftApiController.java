package com.iq.anthology.web;

import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.EssayService;
import com.iq.anthology.support.DomainException;
import jakarta.servlet.http.HttpServletRequest;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 자동 저장. 쓰기 화면이 입력이 멈출 때마다 부른다. 제출은 하지 않는다.
 *
 * <p>응답은 화면이 바로 쓸 수 있는 모양이다: 성공이면 저장 시각, 실패면 사람이 읽을 메시지.
 */
@RestController
public class DraftApiController {

    private static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HH:mm");

    private final EssayService essayService;
    private final ContributorCookies cookies;

    public DraftApiController(EssayService essayService, ContributorCookies cookies) {
        this.essayService = essayService;
        this.cookies = cookies;
    }

    @PostMapping("/anthologies/{code}/essay/autosave")
    public ResponseEntity<Map<String, Object>> autosave(@PathVariable String code,
                                                        @ModelAttribute Forms.WriteEssay form,
                                                        HttpServletRequest request) {
        try {
            Essay essay = essayService.save(code, cookies.read(request, code), form.getTitle(), form.getQuote(),
                    form.getBody(), false);
            return ResponseEntity.ok(Map.of(
                    "saved", true,
                    "savedAt", essay.updatedAt().format(TIME),
                    "savedAtMillis", AnthologyController.epochMillis(essay.updatedAt()),
                    "submitted", essay.isSubmitted(),
                    "length", essay.bodyLength()));
        } catch (DomainException e) {
            return ResponseEntity.status(e.type().status()).body(Map.of(
                    "saved", false,
                    "message", e.getMessage()));
        }
    }
}
