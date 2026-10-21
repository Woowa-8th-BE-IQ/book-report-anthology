package com.iq.anthology.book;

import java.util.ArrayList;
import java.util.List;

/**
 * 전자책 표지(SVG). 랜딩의 회전 포스터를 정지 화면으로 옮겼다: 가운데 원을 두고 독후감 종이 네 장이 돌아가며 놓인다.
 * 글자는 리더 앱의 명조체로 그려진다. 크기는 600×900(2:3).
 */
public final class CoverArt {

    private static final int WIDTH = 600;
    private static final int HEIGHT = 900;
    private static final int TITLE_LINE_MAX = 9;

    private CoverArt() {
    }

    public static String svg(Manuscript manuscript) {
        StringBuilder svg = new StringBuilder();
        svg.append("<?xml version=\"1.0\" encoding=\"UTF-8\"?>\n");
        svg.append("<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 ").append(WIDTH).append(' ')
                .append(HEIGHT).append("\" width=\"").append(WIDTH).append("\" height=\"").append(HEIGHT)
                .append("\">\n");
        svg.append("  <rect width=\"100%\" height=\"100%\" fill=\"#F6F1E9\"/>\n");
        svg.append("  <text x=\"300\" y=\"86\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"15\" "
                + "letter-spacing=\"6\" fill=\"#B8571A\">독후감 문집</text>\n");

        // 종이 네 장: 원을 둘러 90도씩 돌아가며 놓인다
        svg.append("  <g transform=\"translate(300 330)\">\n");
        String[] fills = {"#FFFDF8", "#1A1208", "#FFFDF8", "#1A1208"};
        for (int i = 0; i < 4; i++) {
            int angle = i * 90 + 12;
            svg.append("    <g transform=\"rotate(").append(angle).append(") translate(0 -118)\">\n");
            svg.append("      <rect x=\"-52\" y=\"-70\" width=\"104\" height=\"140\" fill=\"").append(fills[i])
                    .append("\" stroke=\"#D8C9B4\" stroke-width=\"1.5\"/>\n");
            String ink = i % 2 == 0 ? "#1A1208" : "#FFFDF8";
            svg.append("      <rect x=\"-40\" y=\"-58\" width=\"30\" height=\"30\" fill=\"")
                    .append(i % 2 == 0 ? "#1A1208" : "#B8571A").append("\"/>\n");
            for (int line = 0; line < 3; line++) {
                svg.append("      <rect x=\"-40\" y=\"").append(14 + line * 14).append("\" width=\"")
                        .append(80 - line * 18).append("\" height=\"5\" fill=\"").append(ink)
                        .append("\" opacity=\"0.55\"/>\n");
            }
            svg.append("    </g>\n");
        }
        svg.append("    <circle r=\"62\" fill=\"#F6F1E9\" stroke=\"#D8C9B4\" stroke-width=\"1.5\"/>\n");
        svg.append("    <text y=\"10\" text-anchor=\"middle\" font-family=\"serif\" font-size=\"30\" font-weight=\"bold\" "
                + "fill=\"#B8571A\">").append(manuscript.pieces().size()).append("</text>\n");
        svg.append("    <text y=\"34\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"11\" "
                + "letter-spacing=\"3\" fill=\"#8A7660\">편</text>\n");
        svg.append("  </g>\n");

        // 제목
        List<String> lines = wrap(manuscript.title(), TITLE_LINE_MAX);
        int fontSize = lines.size() > 2 ? 40 : 48;
        int y = 600;
        for (String line : lines) {
            svg.append("  <text x=\"300\" y=\"").append(y).append("\" text-anchor=\"middle\" font-family=\"serif\" ")
                    .append("font-size=\"").append(fontSize).append("\" font-weight=\"bold\" fill=\"#1A1208\">")
                    .append(EpubWriter.escape(line)).append("</text>\n");
            y += fontSize + 12;
        }
        svg.append("  <rect x=\"278\" y=\"").append(y - 18).append("\" width=\"44\" height=\"3\" fill=\"#B8571A\"/>\n");
        svg.append("  <text x=\"300\" y=\"").append(y + 28).append("\" text-anchor=\"middle\" font-family=\"serif\" ")
                .append("font-size=\"18\" fill=\"#4A3020\">").append(EpubWriter.escape(manuscript.readLine()))
                .append("</text>\n");
        svg.append("  <text x=\"300\" y=\"842\" text-anchor=\"middle\" font-family=\"sans-serif\" font-size=\"14\" "
                + "fill=\"#8A7660\">").append(manuscript.pieces().size()).append("명이 쓴 독후감</text>\n");
        svg.append("</svg>\n");
        return svg.toString();
    }

    /** 띄어쓰기를 살려 한 줄에 max자 안팎으로 나눈다. 띄어쓰기 없는 긴 낱말은 글자 단위로 자른다. 최대 3줄. */
    static List<String> wrap(String text, int max) {
        List<String> lines = new ArrayList<>();
        StringBuilder current = new StringBuilder();
        for (String word : text.strip().split("\\s+")) {
            while (word.codePointCount(0, word.length()) > max) {
                flush(lines, current);
                int cut = word.offsetByCodePoints(0, max);
                lines.add(word.substring(0, cut));
                word = word.substring(cut);
            }
            int length = current.codePointCount(0, current.length());
            if (length > 0 && length + 1 + word.codePointCount(0, word.length()) > max) {
                flush(lines, current);
            }
            if (!current.isEmpty()) {
                current.append(' ');
            }
            current.append(word);
        }
        flush(lines, current);
        if (lines.size() > 3) {
            List<String> kept = new ArrayList<>(lines.subList(0, 3));
            kept.set(2, kept.get(2) + "…");
            return kept;
        }
        return lines;
    }

    private static void flush(List<String> lines, StringBuilder current) {
        if (!current.isEmpty()) {
            lines.add(current.toString());
            current.setLength(0);
        }
    }
}
