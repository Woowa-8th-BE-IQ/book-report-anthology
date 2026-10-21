package com.iq.anthology.book;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Test;

class PdfBookTest {

    private static final String LONG = "같은 책을 읽고도 서로 다른 문장에 멈춘다는 게 신기했다. ".repeat(120);

    private final Manuscript manuscript = new Manuscript(
            "urn:uuid:00000000-0000-0000-0000-000000000001",
            "일단 나부터 읽어 봅니다",
            "마틴 파울러, 『리팩터링』",
            "마틴 파울러, 『리팩터링』을 읽고",
            "함께 읽었습니다.",
            LocalDate.of(2026, 12, 1),
            List.of(
                    new Manuscript.Piece(1, "코드보다 나를 먼저", "감자", "짧은 밑줄", LONG + "\n\n" + LONG),
                    new Manuscript.Piece(2, "이름을 바꾸는 용기", "구름(김민수)", null, "본문")),
            List.of("가장 오래 붙든 문장은?"),
            "용어사전");

    @Test
    void A5_PDF에_글꼴을_넣고_여러_쪽으로_만든다() {
        byte[] pdf = PdfBook.write(manuscript);
        String raw = new String(pdf, StandardCharsets.ISO_8859_1);

        assertThat(raw).startsWith("%PDF-");
        assertThat(raw).contains("NanumMyeongjo");
        // A5 = 420 x 595pt
        assertThat(raw).containsPattern("/MediaBox\\s*\\[0 0 419\\.\\d+ 595\\.\\d+\\]|/MediaBox\\s*\\[0 0 420 595\\]");
        assertThat(pageCount(raw)).isGreaterThanOrEqualTo(7); // 표제, 소개, 차례, 글 2편(첫 편은 여러 쪽), 부록, 판권
    }

    @Test
    void 파일_이름에_인쇄용을_붙인다() {
        assertThat(PdfBook.fileName(manuscript)).isEqualTo("일단 나부터 읽어 봅니다 (A5 인쇄용).pdf");
    }

    private static int pageCount(String raw) {
        Matcher matcher = Pattern.compile("/Type\\s*/Page[^s]").matcher(raw);
        int count = 0;
        while (matcher.find()) {
            count++;
        }
        return count;
    }
}
