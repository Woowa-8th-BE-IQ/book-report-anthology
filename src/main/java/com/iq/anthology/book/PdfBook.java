package com.iq.anthology.book;

import com.lowagie.text.Chunk;
import com.lowagie.text.Document;
import com.lowagie.text.DocumentException;
import com.lowagie.text.Element;
import com.lowagie.text.Font;
import com.lowagie.text.PageSize;
import com.lowagie.text.Paragraph;
import com.lowagie.text.Phrase;
import com.lowagie.text.SplitCharacter;
import com.lowagie.text.pdf.BaseFont;
import com.lowagie.text.pdf.ColumnText;
import com.lowagie.text.pdf.PdfChunk;
import com.lowagie.text.pdf.PdfPageEventHelper;
import com.lowagie.text.pdf.PdfWriter;
import com.lowagie.text.pdf.draw.DottedLineSeparator;
import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.Map;

/**
 * 종이책 주문형 출판(POD)용 PDF. 부크크·교보 퍼플의 A5 판형(148×210mm)에 맞춘다.
 *
 * <p>구성: 표제지 → 도서 소개·질문 → 차례(쪽번호) → 독후감(새 쪽에서 시작) → 부록 → 지은이.
 * 차례에 쪽번호를 넣으려고 두 번 조판한다. 첫 번째로 각 글이 시작하는 쪽을 재고, 두 번째에 그 번호를 쓴다.
 * 차례가 차지하는 쪽 수는 글 개수에만 달려 있어서 두 번 사이에 쪽이 밀리지 않는다.
 */
public final class PdfBook {

    private static final Color INK = new Color(0x1A, 0x12, 0x08);
    private static final Color INK_SOFT = new Color(0x4A, 0x30, 0x20);
    private static final Color MUTED = new Color(0x8A, 0x76, 0x60);
    private static final Color ACCENT = new Color(0xB8, 0x57, 0x1A);
    private static final DateTimeFormatter KOREAN_DATE = DateTimeFormatter.ofPattern("yyyy년 M월 d일");

    /** 한국어는 어절(띄어쓰기) 단위로 줄을 바꾼다. 글자 단위로 끊으면 낱말이 쪼개져 읽기 어렵다. */
    private static final SplitCharacter BY_WORD = (int start, int current, int end, char[] cc, PdfChunk[] ck) -> {
        char c = cc[current];
        return c == ' ' || c == '\t' || c == '-' || c == '/';
    };

    private PdfBook() {
    }

    public static byte[] write(Manuscript manuscript) {
        Rendered first = render(manuscript, Map.of());
        return render(manuscript, first.startPages()).bytes();
    }

    public static String fileName(Manuscript manuscript) {
        return EpubWriter.fileName(manuscript).replaceAll("\\.epub$", "") + " (A5 인쇄용).pdf";
    }

    private static Rendered render(Manuscript manuscript, Map<Integer, Integer> knownStartPages) {
        Fonts fonts = Fonts.load();
        ByteArrayOutputStream bytes = new ByteArrayOutputStream();
        Document document = new Document(PageSize.A5, 54, 48, 60, 64);
        Map<Integer, Integer> startPages = new HashMap<>();
        try {
            PdfWriter writer = PdfWriter.getInstance(document, bytes);
            writer.setPageEvent(new PageNumbers(fonts.small));
            document.addTitle(manuscript.title());
            document.addAuthor(String.join(", ", manuscript.bylines()));
            document.addSubject(manuscript.readLine());
            document.addCreator("남의 독후감");
            document.open();

            titlePage(document, manuscript, fonts);
            if (manuscript.hasFrontMatter()) {
                document.newPage();
                frontMatter(document, manuscript, fonts);
            }
            document.newPage();
            contents(document, manuscript, fonts, knownStartPages);
            for (Manuscript.Piece piece : manuscript.pieces()) {
                document.newPage();
                startPages.put(piece.number(), writer.getPageNumber());
                piece(document, manuscript, piece, fonts);
            }
            if (manuscript.hasAppendix()) {
                document.newPage();
                heading(document, "부록", fonts);
                body(document, manuscript.appendix(), fonts);
            }
            document.newPage();
            colophon(document, manuscript, fonts);
            document.close();
        } catch (DocumentException e) {
            throw new IllegalStateException("PDF를 만들지 못했어요.", e);
        }
        return new Rendered(bytes.toByteArray(), startPages);
    }

    private static void titlePage(Document document, Manuscript manuscript, Fonts fonts) {
        Paragraph kicker = paragraph("독후감 문집", fonts.kicker, Element.ALIGN_CENTER);
        kicker.setSpacingBefore(150);
        document.add(kicker);
        Paragraph title = paragraph(manuscript.title(), fonts.title, Element.ALIGN_CENTER);
        title.setSpacingBefore(14);
        title.setLeading(0, 1.35f);
        document.add(title);
        Paragraph source = paragraph(manuscript.readLine(), fonts.soft, Element.ALIGN_CENTER);
        source.setSpacingBefore(18);
        document.add(source);
        Paragraph count = paragraph(manuscript.pieces().size() + "명이 쓴 독후감", fonts.small, Element.ALIGN_CENTER);
        count.setSpacingBefore(90);
        document.add(count);
    }

    private static void frontMatter(Document document, Manuscript manuscript, Fonts fonts) {
        if (manuscript.hasIntroduction()) {
            heading(document, "도서 소개", fonts);
            body(document, manuscript.introduction(), fonts);
        }
        if (manuscript.hasPrompts()) {
            Paragraph label = paragraph("이 문집이 함께 붙든 질문", fonts.kicker, Element.ALIGN_LEFT);
            label.setSpacingBefore(manuscript.hasIntroduction() ? 26 : 0);
            label.setSpacingAfter(10);
            document.add(label);
            int number = 1;
            for (String prompt : manuscript.prompts()) {
                Paragraph line = paragraph(number++ + ".  " + prompt, fonts.body, Element.ALIGN_LEFT);
                line.setIndentationLeft(10);
                line.setLeading(0, 1.6f);
                line.setSpacingAfter(6);
                document.add(line);
            }
        }
    }

    private static void contents(Document document, Manuscript manuscript, Fonts fonts, Map<Integer, Integer> pages) {
        heading(document, "차례", fonts);
        for (Manuscript.Piece piece : manuscript.pieces()) {
            Paragraph byline = paragraph(piece.byline(), fonts.small, Element.ALIGN_LEFT);
            byline.setSpacingBefore(8);
            document.add(byline);
            Paragraph entry = new Paragraph();
            entry.setLeading(0, 1.4f);
            entry.add(chunk(piece.title(), fonts.bodyBold));
            entry.add(new Chunk(new DottedLineSeparator()));
            Integer page = pages.get(piece.number());
            entry.add(new Chunk(page == null ? "000" : String.valueOf(page), fonts.body));
            document.add(entry);
        }
    }

    private static void piece(Document document, Manuscript manuscript, Manuscript.Piece piece, Fonts fonts) {
        Paragraph byline = paragraph(piece.byline(), fonts.kicker, Element.ALIGN_LEFT);
        byline.setSpacingBefore(24);
        document.add(byline);
        Paragraph title = paragraph(piece.title(), fonts.heading, Element.ALIGN_LEFT);
        title.setLeading(0, 1.35f);
        title.setSpacingBefore(4);
        title.setSpacingAfter(22);
        document.add(title);
        if (piece.hasQuote()) {
            Paragraph quote = paragraph(piece.quote(), fonts.quote, Element.ALIGN_LEFT);
            quote.setIndentationLeft(14);
            quote.setIndentationRight(8);
            quote.setLeading(0, 1.65f);
            document.add(quote);
            Paragraph citation = paragraph("— " + manuscript.citation(), fonts.small, Element.ALIGN_RIGHT);
            citation.setIndentationRight(8);
            citation.setSpacingBefore(4);
            citation.setSpacingAfter(20);
            document.add(citation);
        }
        body(document, piece.body(), fonts);
    }

    private static void colophon(Document document, Manuscript manuscript, Fonts fonts) {
        heading(document, "지은이", fonts);
        for (String byline : manuscript.bylines()) {
            Paragraph name = paragraph(byline, fonts.body, Element.ALIGN_LEFT);
            name.setLeading(0, 1.6f);
            document.add(name);
        }
        Paragraph closed = paragraph(manuscript.closedOn().format(KOREAN_DATE) + " 엮음", fonts.soft, Element.ALIGN_LEFT);
        closed.setSpacingBefore(24);
        document.add(closed);
        Paragraph note = paragraph("이 책은 " + manuscript.readLine() + " 쓴 독후감을 모은 것입니다. "
                + "본문의 인용은 원서에서 가져왔으며, 원서의 저작권은 저작권자에게 있습니다. "
                + "각 독후감의 저작권은 쓴 사람에게 있습니다.", fonts.small, Element.ALIGN_LEFT);
        note.setSpacingBefore(14);
        note.setLeading(0, 1.6f);
        document.add(note);
    }

    private static void heading(Document document, String text, Fonts fonts) {
        Paragraph heading = paragraph(text, fonts.heading, Element.ALIGN_LEFT);
        heading.setSpacingBefore(24);
        heading.setSpacingAfter(18);
        document.add(heading);
    }

    /** 빈 줄로 문단을 나누고, 첫 줄을 들여 쓰고, 양쪽 맞춤으로 짠다. */
    private static void body(Document document, String text, Fonts fonts) {
        for (String block : EpubWriter.paragraphs(text)) {
            Paragraph paragraph = paragraph(block, fonts.body, Element.ALIGN_JUSTIFIED);
            paragraph.setFirstLineIndent(10);
            paragraph.setLeading(0, 1.75f);
            paragraph.setSpacingAfter(7);
            document.add(paragraph);
        }
    }

    private static Paragraph paragraph(String text, Font font, int alignment) {
        Paragraph paragraph = new Paragraph();
        paragraph.add(chunk(text, font));
        paragraph.setAlignment(alignment);
        return paragraph;
    }

    private static Chunk chunk(String text, Font font) {
        Chunk chunk = new Chunk(text, font);
        chunk.setSplitCharacter(BY_WORD);
        return chunk;
    }

    private record Rendered(byte[] bytes, Map<Integer, Integer> startPages) {
    }

    /** 표제지(1쪽)를 뺀 모든 쪽 아래에 쪽번호를 넣는다. */
    private static final class PageNumbers extends PdfPageEventHelper {

        private final Font font;

        PageNumbers(Font font) {
            this.font = font;
        }

        @Override
        public void onEndPage(PdfWriter writer, Document document) {
            int page = writer.getPageNumber();
            if (page <= 1) {
                return;
            }
            float x = (document.left() + document.right()) / 2;
            ColumnText.showTextAligned(writer.getDirectContent(), Element.ALIGN_CENTER,
                    new Phrase(String.valueOf(page), font), x, document.bottom() - 28, 0);
        }
    }

    /** 나눔명조(OFL)를 문서에 묻는다. 쓰인 글자만 들어가도록 부분 임베드된다. */
    private record Fonts(Font body, Font bodyBold, Font soft, Font quote, Font small, Font kicker, Font heading,
                         Font title) {

        static Fonts load() {
            BaseFont regular = Holder.REGULAR;
            BaseFont bold = Holder.BOLD;
            return new Fonts(
                    new Font(regular, 9.6f, Font.NORMAL, INK),
                    new Font(bold, 9.6f, Font.NORMAL, INK),
                    new Font(regular, 10.5f, Font.NORMAL, INK_SOFT),
                    new Font(regular, 9.2f, Font.NORMAL, INK_SOFT),
                    new Font(regular, 7.8f, Font.NORMAL, MUTED),
                    new Font(bold, 8.2f, Font.NORMAL, ACCENT),
                    new Font(bold, 15f, Font.NORMAL, INK),
                    new Font(bold, 22f, Font.NORMAL, INK));
        }
    }

    private static final class Holder {

        static final BaseFont REGULAR = font("NanumMyeongjo-Regular.ttf");
        static final BaseFont BOLD = font("NanumMyeongjo-Bold.ttf");

        private static BaseFont font(String file) {
            try (InputStream in = PdfBook.class.getResourceAsStream("/fonts/" + file)) {
                if (in == null) {
                    throw new IllegalStateException("글꼴을 찾을 수 없어요: " + file);
                }
                return BaseFont.createFont(file, BaseFont.IDENTITY_H, BaseFont.EMBEDDED, BaseFont.CACHED,
                        in.readAllBytes(), null);
            } catch (IOException e) {
                throw new UncheckedIOException(e);
            } catch (DocumentException e) {
                throw new IllegalStateException(e);
            }
        }
    }
}
