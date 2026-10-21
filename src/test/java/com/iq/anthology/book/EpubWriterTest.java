package com.iq.anthology.book;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;
import javax.xml.parsers.DocumentBuilderFactory;
import org.junit.jupiter.api.Test;

class EpubWriterTest {

    private final Manuscript manuscript = new Manuscript(
            "urn:uuid:00000000-0000-0000-0000-000000000001",
            "일단 나부터 <읽어> 봅니다",
            "마틴 파울러, 『리팩터링』",
            "마틴 파울러, 『리팩터링』을 읽고",
            "첫 문단.\n\n둘째 문단 & 끝.",
            LocalDate.of(2026, 12, 1),
            List.of(
                    new Manuscript.Piece(1, "코드보다 나를 먼저", "감자", "짧은 밑줄",
                            "첫 문단\n이어지는 줄.\n\n<script>alert(1)</script> 둘째 문단\u0007"),
                    new Manuscript.Piece(2, "이름을 바꾸는 용기", "구름(김민수)", null, "본문")));

    @Test
    void 첫_항목은_압축하지_않은_mimetype이다() throws IOException {
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(EpubWriter.write(manuscript)))) {
            ZipEntry first = zip.getNextEntry();

            assertThat(first.getName()).isEqualTo("mimetype");
            assertThat(first.getMethod()).isEqualTo(ZipEntry.STORED);
            assertThat(new String(zip.readAllBytes(), StandardCharsets.US_ASCII)).isEqualTo("application/epub+zip");
        }
    }

    @Test
    void 모든_XML_문서가_올바른_형식이다() throws IOException {
        Map<String, String> files = unzip(EpubWriter.write(manuscript));
        DocumentBuilderFactory factory = DocumentBuilderFactory.newInstance();
        factory.setNamespaceAware(true);

        files.entrySet().stream()
                .filter(file -> file.getKey().endsWith(".xhtml") || file.getKey().endsWith(".xml")
                        || file.getKey().endsWith(".opf") || file.getKey().endsWith(".svg"))
                .forEach(file -> assertThatCode(() -> factory.newDocumentBuilder()
                        .parse(new ByteArrayInputStream(file.getValue().getBytes(StandardCharsets.UTF_8))))
                        .as(file.getKey())
                        .doesNotThrowAnyException());
    }

    @Test
    void 본문의_태그와_제어문자는_글자로_남거나_버려진다() throws IOException {
        String essay = unzip(EpubWriter.write(manuscript)).get("OEBPS/essay-1.xhtml");

        assertThat(essay)
                .contains("&lt;script&gt;alert(1)&lt;/script&gt;")
                .doesNotContain("<script>")
                .doesNotContain("\u0007")
                .contains("<p>첫 문단 이어지는 줄.</p>")
                .contains("— 마틴 파울러, 『리팩터링』");
    }

    @Test
    void 차례는_지은이와_제목을_책_순서대로_담는다() throws IOException {
        String nav = unzip(EpubWriter.write(manuscript)).get("OEBPS/nav.xhtml");

        assertThat(nav.indexOf("감자")).isLessThan(nav.indexOf("구름(김민수)"));
        assertThat(nav).contains("코드보다 나를 먼저", "이름을 바꾸는 용기");
    }

    @Test
    void 도서_소개가_없으면_소개_쪽을_만들지_않는다() throws IOException {
        Manuscript withoutIntroduction = new Manuscript(manuscript.identifier(), manuscript.title(),
                manuscript.citation(), manuscript.readLine(), null, manuscript.closedOn(), manuscript.pieces());

        Map<String, String> files = unzip(EpubWriter.write(withoutIntroduction));

        assertThat(files).doesNotContainKey("OEBPS/introduction.xhtml");
        assertThat(files.get("OEBPS/content.opf")).doesNotContain("introduction");
    }

    @Test
    void 표지가_맨_앞에_오고_글감_질문과_부록이_실린다() throws IOException {
        Manuscript full = new Manuscript(manuscript.identifier(), manuscript.title(), manuscript.citation(),
                manuscript.readLine(), null, manuscript.closedOn(), manuscript.pieces(),
                List.of("가장 오래 붙든 문장은?"), "용어사전 & 기록");

        Map<String, String> files = unzip(EpubWriter.write(full));

        String opf = files.get("OEBPS/content.opf");
        assertThat(opf).contains("properties=\"cover-image\"");
        assertThat(opf.indexOf("idref=\"cover\"")).isLessThan(opf.indexOf("idref=\"title\""));
        assertThat(files.get("OEBPS/cover.svg")).contains("2명이 쓴 독후감");
        assertThat(files.get("OEBPS/introduction.xhtml")).contains("가장 오래 붙든 문장은?");
        assertThat(files.get("OEBPS/appendix.xhtml")).contains("용어사전 &amp; 기록");
        assertThat(files.get("OEBPS/nav.xhtml")).contains("부록");
    }

    @Test
    void 파일_이름에서_쓸_수_없는_글자를_뺀다() {
        assertThat(EpubWriter.fileName(manuscript)).isEqualTo("일단 나부터 읽어 봅니다.epub");
    }

    private static Map<String, String> unzip(byte[] epub) throws IOException {
        Map<String, String> files = new LinkedHashMap<>();
        try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(epub))) {
            for (ZipEntry entry = zip.getNextEntry(); entry != null; entry = zip.getNextEntry()) {
                files.put(entry.getName(), new String(zip.readAllBytes(), StandardCharsets.UTF_8));
            }
        }
        return files;
    }
}
