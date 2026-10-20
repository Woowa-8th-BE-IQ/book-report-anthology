package com.iq.anthology.book;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.zip.CRC32;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

/**
 * 원고를 EPUB 3 파일로 쓴다. 외부 라이브러리 없이 {@link ZipOutputStream}만 쓴다.
 *
 * <p>구성: 표제지 → 도서 소개 → 차례 → 독후감 → 지은이. 규격상 첫 항목은 무압축 {@code mimetype}이다.
 */
public final class EpubWriter {

    private static final String MIMETYPE = "application/epub+zip";
    private static final DateTimeFormatter KOREAN_DATE = DateTimeFormatter.ofPattern("yyyy년 M월 d일");

    private EpubWriter() {
    }

    public static byte[] write(Manuscript manuscript) {
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        try (ZipOutputStream zip = new ZipOutputStream(bytes, StandardCharsets.UTF_8)) {
            putStored(zip, "mimetype", MIMETYPE);
            put(zip, "META-INF/container.xml", containerXml());
            put(zip, "OEBPS/content.opf", contentOpf(manuscript));
            put(zip, "OEBPS/style.css", STYLE);
            put(zip, "OEBPS/title.xhtml", titleXhtml(manuscript));
            if (manuscript.hasIntroduction()) {
                put(zip, "OEBPS/introduction.xhtml", introductionXhtml(manuscript));
            }
            put(zip, "OEBPS/nav.xhtml", navXhtml(manuscript));
            for (Manuscript.Piece piece : manuscript.pieces()) {
                put(zip, "OEBPS/" + pieceFile(piece), pieceXhtml(manuscript, piece));
            }
            put(zip, "OEBPS/colophon.xhtml", colophonXhtml(manuscript));
        } catch (IOException e) {
            throw new UncheckedIOException("EPUB을 만들지 못했어요.", e);
        }
        return bytes.toByteArray();
    }

    /** 내려받을 파일 이름. 파일 시스템에 쓸 수 없는 글자는 뺀다. */
    public static String fileName(Manuscript manuscript) {
        String safe = manuscript.title().replaceAll("[\\\\/:*?\"<>|\\p{Cntrl}]", "").strip();
        return (safe.isEmpty() ? "anthology" : safe) + ".epub";
    }

    static String pieceFile(Manuscript.Piece piece) {
        return "essay-" + piece.number() + ".xhtml";
    }

    private static String containerXml() {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
                  <rootfiles>
                    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
                  </rootfiles>
                </container>
                """;
    }

    private static String contentOpf(Manuscript manuscript) {
        StringBuilder creators = new StringBuilder();
        for (String byline : manuscript.bylines()) {
            creators.append("    <dc:creator>").append(escape(byline)).append("</dc:creator>\n");
        }
        StringBuilder manifest = new StringBuilder();
        StringBuilder spine = new StringBuilder();
        item(manifest, "style", "style.css", "text/css", null);
        page(manifest, spine, "title", "title.xhtml", null);
        if (manuscript.hasIntroduction()) {
            page(manifest, spine, "introduction", "introduction.xhtml", null);
        }
        page(manifest, spine, "nav", "nav.xhtml", "nav");
        for (Manuscript.Piece piece : manuscript.pieces()) {
            page(manifest, spine, "essay-" + piece.number(), pieceFile(piece), null);
        }
        page(manifest, spine, "colophon", "colophon.xhtml", null);

        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="book-id" xml:lang="ko">
                  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
                    <dc:identifier id="book-id">%s</dc:identifier>
                    <dc:title>%s</dc:title>
                    <dc:language>ko</dc:language>
                %s    <dc:date>%s</dc:date>
                    <dc:description>%s</dc:description>
                    <meta property="dcterms:modified">%sT00:00:00Z</meta>
                  </metadata>
                  <manifest>
                %s  </manifest>
                  <spine>
                %s  </spine>
                </package>
                """.formatted(
                escape(manuscript.identifier()),
                escape(manuscript.title()),
                creators,
                manuscript.closedOn(),
                escape(manuscript.readLine() + " " + manuscript.pieces().size() + "명이 쓴 독후감"),
                manuscript.closedOn(),
                manifest,
                spine);
    }

    private static void page(StringBuilder manifest, StringBuilder spine, String id, String href, String properties) {
        item(manifest, id, href, "application/xhtml+xml", properties);
        spine.append("    <itemref idref=\"").append(id).append("\"/>\n");
    }

    private static void item(StringBuilder manifest, String id, String href, String mediaType, String properties) {
        manifest.append("    <item id=\"").append(id).append("\" href=\"").append(href)
                .append("\" media-type=\"").append(mediaType).append('"');
        if (properties != null) {
            manifest.append(" properties=\"").append(properties).append('"');
        }
        manifest.append("/>\n");
    }

    private static String titleXhtml(Manuscript manuscript) {
        return xhtml(manuscript.title(), """
                  <section class="title-page" epub:type="titlepage">
                    <h1>%s</h1>
                    <p class="source">%s</p>
                    <p class="count">%d명이 쓴 독후감</p>
                  </section>
                """.formatted(
                escape(manuscript.title()),
                escape(manuscript.readLine()),
                manuscript.pieces().size()));
    }

    private static String introductionXhtml(Manuscript manuscript) {
        StringBuilder body = new StringBuilder();
        body.append("  <section class=\"introduction\" epub:type=\"preface\">\n");
        body.append("    <h1>도서 소개</h1>\n");
        for (String paragraph : paragraphs(manuscript.introduction())) {
            body.append("    <p>").append(escape(paragraph)).append("</p>\n");
        }
        body.append("  </section>\n");
        return xhtml("도서 소개", body.toString());
    }

    /** 레퍼런스 문집처럼 차례가 곧 지은이 목록이다: "감자(김주하) · 제목" */
    private static String navXhtml(Manuscript manuscript) {
        StringBuilder items = new StringBuilder();
        for (Manuscript.Piece piece : manuscript.pieces()) {
            items.append("        <li><a href=\"").append(pieceFile(piece)).append("\">")
                    .append("<span class=\"toc-byline\">").append(escape(piece.byline())).append("</span> ")
                    .append("<span class=\"toc-title\">").append(escape(piece.title())).append("</span>")
                    .append("</a></li>\n");
        }
        items.append("        <li><a href=\"colophon.xhtml\">지은이</a></li>\n");
        return xhtml("차례", """
                  <nav epub:type="toc" id="toc">
                    <h1>차례</h1>
                    <ol>
                %s    </ol>
                  </nav>
                """.formatted(items));
    }

    private static String pieceXhtml(Manuscript manuscript, Manuscript.Piece piece) {
        StringBuilder body = new StringBuilder();
        body.append("  <section epub:type=\"chapter\">\n");
        body.append("    <p class=\"byline\">").append(escape(piece.byline())).append("</p>\n");
        body.append("    <h1>").append(escape(piece.title())).append("</h1>\n");
        if (piece.hasQuote()) {
            body.append("    <blockquote>\n");
            body.append("      <p>").append(escape(piece.quote())).append("</p>\n");
            body.append("      <footer>— ").append(escape(manuscript.citation())).append("</footer>\n");
            body.append("    </blockquote>\n");
        }
        for (String paragraph : paragraphs(piece.body())) {
            body.append("    <p>").append(escape(paragraph)).append("</p>\n");
        }
        body.append("  </section>\n");
        return xhtml(piece.title(), body.toString());
    }

    private static String colophonXhtml(Manuscript manuscript) {
        StringBuilder names = new StringBuilder();
        for (String byline : manuscript.bylines()) {
            names.append("      <li>").append(escape(byline)).append("</li>\n");
        }
        return xhtml("지은이", """
                  <section class="colophon" epub:type="colophon">
                    <h1>지은이</h1>
                    <ul class="authors">
                %s    </ul>
                    <p>%s 엮음</p>
                    <p class="note">이 책은 %s 쓴 독후감을 모은 것입니다. 본문의 인용은 원서에서 가져왔으며, 원서의 저작권은 저작권자에게 있습니다. 각 독후감의 저작권은 쓴 사람에게 있습니다.</p>
                  </section>
                """.formatted(
                names,
                manuscript.closedOn().format(KOREAN_DATE),
                escape(manuscript.readLine())));
    }

    private static String xhtml(String title, String body) {
        return """
                <?xml version="1.0" encoding="UTF-8"?>
                <!DOCTYPE html>
                <html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="ko" lang="ko">
                <head>
                  <meta charset="UTF-8"/>
                  <title>%s</title>
                  <link rel="stylesheet" type="text/css" href="style.css"/>
                </head>
                <body>
                %s</body>
                </html>
                """.formatted(escape(title), body);
    }

    /** 빈 줄로 나뉜 덩어리를 문단으로, 문단 안 줄바꿈은 공백으로 합친다. */
    static List<String> paragraphs(String text) {
        List<String> paragraphs = new ArrayList<>();
        for (String block : text.replace("\r\n", "\n").split("\n\\s*\n")) {
            String joined = block.strip().replaceAll("\\s*\n\\s*", " ");
            if (!joined.isEmpty()) {
                paragraphs.add(joined);
            }
        }
        return paragraphs;
    }

    static String escape(String text) {
        StringBuilder escaped = new StringBuilder(text.length());
        text.codePoints().forEach(codePoint -> {
            switch (codePoint) {
                case '&' -> escaped.append("&amp;");
                case '<' -> escaped.append("&lt;");
                case '>' -> escaped.append("&gt;");
                case '"' -> escaped.append("&quot;");
                case '\'' -> escaped.append("&#39;");
                default -> {
                    if (isXmlChar(codePoint)) {
                        escaped.appendCodePoint(codePoint);
                    }
                }
            }
        });
        return escaped.toString();
    }

    /** XML 1.0에서 허용하지 않는 제어 문자는 버린다. */
    private static boolean isXmlChar(int codePoint) {
        return codePoint == 0x9 || codePoint == 0xA || codePoint == 0xD
                || (codePoint >= 0x20 && codePoint <= 0xD7FF)
                || (codePoint >= 0xE000 && codePoint <= 0xFFFD)
                || (codePoint >= 0x10000 && codePoint <= 0x10FFFF);
    }

    private static void putStored(ZipOutputStream zip, String name, String content) throws IOException {
        byte[] data = content.getBytes(StandardCharsets.US_ASCII);
        CRC32 crc = new CRC32();
        crc.update(data);
        ZipEntry entry = new ZipEntry(name);
        entry.setMethod(ZipEntry.STORED);
        entry.setSize(data.length);
        entry.setCompressedSize(data.length);
        entry.setCrc(crc.getValue());
        zip.putNextEntry(entry);
        zip.write(data);
        zip.closeEntry();
    }

    private static void put(ZipOutputStream zip, String name, String content) throws IOException {
        zip.putNextEntry(new ZipEntry(name));
        zip.write(content.getBytes(StandardCharsets.UTF_8));
        zip.closeEntry();
    }

    private static final String STYLE = """
            body { font-family: serif; line-height: 1.85; margin: 0 6%; color: #1a1208; }
            h1 { font-size: 1.45em; margin: 0.2em 0 1.4em; line-height: 1.4; }
            p { margin: 0 0 1em; text-align: justify; }
            .title-page { text-align: center; margin-top: 32%; }
            .title-page h1 { font-size: 2.1em; margin-bottom: 0.6em; }
            .source { color: #4a3020; }
            .count { font-family: sans-serif; font-size: 0.8em; letter-spacing: 0.15em; color: #b8571a; margin-top: 3em; }
            .byline { font-family: sans-serif; font-size: 0.8em; letter-spacing: 0.08em; color: #b8571a; margin-bottom: 0.2em; }
            blockquote { margin: 1.4em 0 2em; padding: 0.8em 1.2em; border-left: 3px solid #b8571a; background: #f6f1e9; }
            blockquote p { margin: 0 0 0.4em; }
            blockquote footer { font-size: 0.8em; color: #8a7660; text-align: right; }
            nav ol { list-style: none; padding: 0; }
            nav li { margin: 0 0 0.7em; }
            nav a { text-decoration: none; color: inherit; }
            .toc-byline { display: block; font-family: sans-serif; font-size: 0.8em; color: #8a7660; }
            .toc-title { font-weight: bold; }
            .colophon { margin-top: 12%; }
            .authors { list-style: none; padding: 0; columns: 2; }
            .note { font-size: 0.8em; color: #8a7660; margin-top: 2em; }
            """;
}
