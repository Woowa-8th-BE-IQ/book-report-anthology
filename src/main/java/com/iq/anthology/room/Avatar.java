package com.iq.anthology.room;

import com.iq.anthology.anthology.Contributor;

/**
 * 참여자 아바타 SVG. 그림 파일 없이 {@link AvatarStyle}의 조각을 이어 붙인다.
 * 사용자 글자는 그림 안에 넣지 않으므로 그대로 HTML에 넣어도 안전하다.
 */
public final class Avatar {

    private static final String INK = "#1A1208";
    /** 앞의 8색은 예전부터 쓰던 색이다. 순서를 바꾸지 않는다. */
    static final String[] COLORS = {
            "#E8A87C", "#9DB58A", "#8FB3C9", "#C9A3C4", "#E3C26B", "#D98F7E", "#A9C2B0", "#C4A484",
            "#F2B8C6", "#9AA7B8"};

    private Avatar() {
    }

    /** 고른 모양이 있으면 그것으로, 없으면 닉네임·참여 순서로 정한 모양으로 그린다. */
    public static String of(Contributor contributor) {
        return svg(styleOf(contributor));
    }

    public static AvatarStyle styleOf(Contributor contributor) {
        if (contributor.avatarStyle() != null) {
            try {
                return AvatarStyle.parse(contributor.avatarStyle());
            } catch (RuntimeException ignored) {
                // 저장된 값이 깨졌으면 기본 얼굴로 그린다
            }
        }
        return AvatarStyle.derived(contributor.nickname(), contributor.joinOrder());
    }

    public static String svg(String nickname, int joinOrder) {
        return svg(AvatarStyle.derived(nickname, joinOrder));
    }

    public static String svg(AvatarStyle style) {
        String color = COLORS[style.color()];
        StringBuilder svg = new StringBuilder(1400)
                .append("<svg class=\"avatar-svg\" viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\" "
                        + "aria-hidden=\"true\" focusable=\"false\">");
        svg.append(body(style.body(), color));
        svg.append(extra(style.extra()));
        // 얼굴(눈·입)은 따로 묶어 둔다. 화면이 시선을 돌리고(face) 눈을 깜빡이게(blink) 한다.
        svg.append("<g class=\"face\">");
        svg.append(eyes(style.eyes()));
        svg.append(mouth(style.mouth()));
        svg.append("</g>");
        if (style.cheeks() == 1) {
            svg.append("<circle cx=\"20\" cy=\"41\" r=\"3.4\" fill=\"#fff\" opacity=\".35\"/>"
                    + "<circle cx=\"44\" cy=\"41\" r=\"3.4\" fill=\"#fff\" opacity=\".35\"/>");
        }
        return svg.append("</svg>").toString();
    }

    /** 0: 동그라미, 1: 책(왼쪽 책등), 2: 살짝 기운 네모, 3: 구름, 4: 고양이 */
    private static String body(int kind, String color) {
        return switch (kind) {
            case 1 -> "<rect x=\"12\" y=\"13\" width=\"40\" height=\"44\" rx=\"5\" fill=\"" + color + "\"/>"
                    + "<path d=\"M17 13 h1 v44 h-1 a5 5 0 0 1 -5 -5 v-34 a5 5 0 0 1 5 -5z\" fill=\"" + INK
                    + "\" opacity=\".18\"/>";
            case 2 -> "<rect x=\"11\" y=\"14\" width=\"42\" height=\"42\" rx=\"14\" fill=\"" + color
                    + "\" transform=\"rotate(-6 32 35)\"/>";
            case 3 -> "<path d=\"M14 50 a10 10 0 0 1 -2 -19 a12 12 0 0 1 16 -13 a13 13 0 0 1 22 7 a10 10 0 0 1 2 25 z\" fill=\""
                    + color + "\"/>";
            case 4 -> "<path d=\"M13 24 l2 -14 l11 8 z M51 24 l-2 -14 l-11 8 z\" fill=\"" + color + "\"/>"
                    + "<path d=\"M16 21 l1 -7 l5 4 z M48 21 l-1 -7 l-5 4 z\" fill=\"" + INK + "\" opacity=\".14\"/>"
                    + "<circle cx=\"32\" cy=\"36\" r=\"21\" fill=\"" + color + "\"/>";
            default -> "<circle cx=\"32\" cy=\"35\" r=\"22\" fill=\"" + color + "\"/>";
        };
    }

    /** 0: 없음, 1: 책갈피 끈, 2: 베레모, 3: 새싹, 4: 작은 별, 5: 꽃 */
    private static String extra(int kind) {
        return switch (kind) {
            case 1 -> "<path d=\"M40 9 v13 l3 -3 l3 3 v-13 z\" fill=\"#B8571A\"/>";
            case 2 -> "<ellipse cx=\"30\" cy=\"15\" rx=\"15\" ry=\"6\" fill=\"" + INK + "\" opacity=\".82\"/>"
                    + "<circle cx=\"31\" cy=\"9\" r=\"2.2\" fill=\"" + INK + "\" opacity=\".82\"/>";
            case 3 -> "<path d=\"M32 14 v-6\" stroke=\"#4F6B3A\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>"
                    + "<path d=\"M32 9 c-6 -1 -8 -5 -8 -5 c5 -1 8 2 8 5z M32 8 c5 -2 8 -1 9 1 c-3 3 -7 2 -9 -1z\" "
                    + "fill=\"#4F6B3A\"/>";
            case 4 -> "<path d=\"M50 10 l1.6 3.4 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5z\" "
                    + "fill=\"#E3C26B\" stroke=\"" + INK + "\" stroke-width=\".6\"/>";
            case 5 -> "<g transform=\"translate(47 14)\"><circle cx=\"0\" cy=\"-4\" r=\"3\" fill=\"#F2B8C6\"/>"
                    + "<circle cx=\"4\" cy=\"0\" r=\"3\" fill=\"#F2B8C6\"/><circle cx=\"0\" cy=\"4\" r=\"3\" fill=\"#F2B8C6\"/>"
                    + "<circle cx=\"-4\" cy=\"0\" r=\"3\" fill=\"#F2B8C6\"/><circle r=\"2.4\" fill=\"#E3C26B\"/></g>";
            default -> "";
        };
    }

    /** 0: 점, 1: 웃는 눈, 2: 동그란 안경, 3: 윙크 */
    private static String eyes(int kind) {
        return switch (kind) {
            case 1 -> "<g class=\"blink\"><path d=\"M21 34 q3 -4 6 0 M37 34 q3 -4 6 0\" stroke=\"" + INK
                    + "\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/></g>";
            case 2 -> "<circle cx=\"24\" cy=\"33\" r=\"5.5\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"" + INK
                    + "\" stroke-width=\"1.8\"/><circle cx=\"40\" cy=\"33\" r=\"5.5\" fill=\"#fff\" fill-opacity=\".35\" "
                    + "stroke=\"" + INK + "\" stroke-width=\"1.8\"/><path d=\"M29.5 33 h5\" stroke=\"" + INK
                    + "\" stroke-width=\"1.8\"/><g class=\"blink\"><circle cx=\"24\" cy=\"33\" r=\"1.7\" fill=\""
                    + INK + "\"/><circle cx=\"40\" cy=\"33\" r=\"1.7\" fill=\"" + INK + "\"/></g>";
            case 3 -> "<g class=\"blink\"><circle cx=\"24\" cy=\"33\" r=\"2.4\" fill=\"" + INK
                    + "\"/></g><path d=\"M37 33 h6\" stroke=\"" + INK + "\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>";
            default -> "<g class=\"blink\"><circle cx=\"24\" cy=\"33\" r=\"2.4\" fill=\"" + INK
                    + "\"/><circle cx=\"40\" cy=\"33\" r=\"2.4\" fill=\"" + INK + "\"/></g>";
        };
    }

    /** 0: 미소, 1: 오, 2: 일자, 3: 활짝 */
    private static String mouth(int kind) {
        return switch (kind) {
            case 1 -> "<ellipse cx=\"32\" cy=\"44\" rx=\"2.4\" ry=\"3\" fill=\"" + INK + "\"/>";
            case 2 -> "<path d=\"M28 44 h8\" stroke=\"" + INK + "\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>";
            case 3 -> "<path d=\"M26 41 q6 8 12 0 z\" fill=\"" + INK + "\"/>";
            default -> "<path d=\"M27 42 q5 5 10 0\" stroke=\"" + INK
                    + "\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/>";
        };
    }
}
