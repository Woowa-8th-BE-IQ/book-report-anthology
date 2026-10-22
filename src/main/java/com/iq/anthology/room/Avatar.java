package com.iq.anthology.room;

import com.iq.anthology.anthology.Contributor;

/**
 * 참여자 아바타 SVG. 그림 파일 없이 {@link AvatarStyle}의 조각을 이어 붙인다.
 * 사용자 글자는 그림 안에 넣지 않으므로 그대로 HTML에 넣어도 안전하다.
 */
public final class Avatar {

    private static final String INK = "#1A1208";
    /** 소품은 모두 이 한 색이다(서비스 강조색). 캐릭터마다 다른 몸 색 위에서 포인트가 된다. */
    private static final String POINT = "#E4572E";
    /** 몸 색. 저장된 번호가 그대로 이어지도록 순서를 바꾸지 않는다(주황·초록·하늘·보라·노랑·분홍·민트·살구·연분홍·파랑). */
    static final String[] COLORS = {
            "#FF8A5B", "#7BD389", "#6EC1FF", "#B794F6", "#FFC93C", "#FF6F91", "#4FD1C5", "#F4A261",
            "#FF9EC7", "#7F9CF5"};
    /** 몸 뒤에 살짝 비껴 까는 같은 색의 진한 그림자. */
    static final String[] SHADES = {
            "#F94700", "#39B74D", "#0795FE", "#7129F2", "#E2A300", "#FF0842", "#27A79B", "#EA6D0A",
            "#FE2A84", "#194EF2"};

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

    /**
     * 플랫한 한 색 몸 + 같은 색 그림자 + 주황 소품 하나. 선은 긋지 않는다.
     * 얼굴(눈·입)은 따로 묶어 둔다. 화면이 시선을 돌리고(face) 눈을 깜빡이게(blink) 한다.
     */
    public static String svg(AvatarStyle style) {
        StringBuilder svg = new StringBuilder(1600)
                .append("<svg class=\"avatar-svg\" viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\" "
                        + "aria-hidden=\"true\" focusable=\"false\">");
        svg.append("<g transform=\"translate(2.5 3)\">")
                .append(body(style.body(), "fill=\"" + SHADES[style.color()] + "\""))
                .append("</g>");
        svg.append(body(style.body(), "fill=\"" + COLORS[style.color()] + "\""));
        // 왼쪽 위의 짧은 광택. 구름·고양이는 몸 윗선이 낮아서 조금 아래에 긋는다.
        String shine = switch (style.body()) {
            case 3 -> "M17 37q2-5.5 7.5-7";
            case 4 -> "M17.5 33q2-5.5 7.5-7";
            default -> "M19 26q2.5-6.5 9-8";
        };
        svg.append("<path d=\"").append(shine).append("\" stroke=\"#fff\" stroke-width=\"3\" "
                + "stroke-linecap=\"round\" fill=\"none\" opacity=\".55\"/>");
        svg.append(extra(style.extra()));
        svg.append("<g class=\"face\">");
        svg.append(eyes(style.eyes()));
        svg.append(mouth(style.mouth()));
        svg.append("</g>");
        if (style.cheeks() == 1) {
            svg.append("<circle cx=\"20.5\" cy=\"43\" r=\"2.8\" fill=\"#fff\" opacity=\".45\"/>"
                    + "<circle cx=\"43.5\" cy=\"43\" r=\"2.8\" fill=\"#fff\" opacity=\".45\"/>");
        }
        return svg.append("</svg>").toString();
    }

    /** 0: 동그라미, 1: 책, 2: 살짝 기운 네모, 3: 구름, 4: 고양이. paint는 fill 속성. */
    private static String body(int kind, String paint) {
        return switch (kind) {
            case 1 -> "<rect x=\"13\" y=\"13\" width=\"38\" height=\"44\" rx=\"7\" " + paint + "/>";
            case 2 -> "<rect x=\"12\" y=\"15\" width=\"40\" height=\"40\" rx=\"14\" " + paint
                    + " transform=\"rotate(-7 32 35)\"/>";
            case 3 -> "<path d=\"M15 51a9 9 0 0 1-2.3-17.6a11.5 11.5 0 0 1 15.5-12.6a12.5 12.5 0 0 1 21 6.8"
                    + "a9.8 9.8 0 0 1 .8 23.4z\" " + paint + "/>";
            case 4 -> "<path d=\"M13.5 27l2.5-16 11 8.5h10l11-8.5 2.5 16a20 20 0 1 1-37 0z\" " + paint + "/>";
            default -> "<circle cx=\"32\" cy=\"35\" r=\"21\" " + paint + "/>";
        };
    }

    /** 0: 없음, 1: 책갈피 끈, 2: 베레모, 3: 새싹, 4: 별, 5: 꽃. 모두 주황 한 색. */
    private static String extra(int kind) {
        return switch (kind) {
            case 1 -> "<path d=\"M41 8v15l3.4-3.2 3.4 3.2V8z\" fill=\"" + POINT + "\"/>";
            case 2 -> "<path d=\"M14 19q3-10 18-10.5q15 .5 18 10.5q-18 4.5-36 0z\" fill=\"" + POINT + "\"/>"
                    + "<circle cx=\"32\" cy=\"7.5\" r=\"2.4\" fill=\"" + POINT + "\"/>";
            case 3 -> "<path d=\"M32 15v-6\" stroke=\"" + POINT + "\" stroke-width=\"2.6\" stroke-linecap=\"round\"/>"
                    + "<path d=\"M32 10c-6-.5-9-5.5-9-5.5c6-1.2 9 2 9 5.5zM32 9.5c5-3 9-2 10 0c-3 3.5-8 3-10 0z\" "
                    + "fill=\"" + POINT + "\"/>";
            case 4 -> "<path d=\"M50 5l2.1 5 5.4.6-4 3.6 1.1 5.3-4.6-2.7-4.6 2.7 1.1-5.3-4-3.6 5.4-.6z\" fill=\""
                    + POINT + "\"/>";
            case 5 -> "<g transform=\"translate(48 12)\" fill=\"" + POINT + "\"><circle cy=\"-4.2\" r=\"3.4\"/>"
                    + "<circle cx=\"4.2\" r=\"3.4\"/><circle cy=\"4.2\" r=\"3.4\"/><circle cx=\"-4.2\" r=\"3.4\"/>"
                    + "<circle r=\"2.6\" fill=\"#FFF3E0\"/></g>";
            default -> "";
        };
    }

    /** 0: 콩 눈(세로 알약), 1: 웃는 눈, 2: 동그란 안경, 3: 윙크 */
    private static String eyes(int kind) {
        String bean = "<rect x=\"24\" y=\"33\" width=\"4\" height=\"6.4\" rx=\"2\" fill=\"" + INK + "\"/>";
        return switch (kind) {
            case 1 -> "<g class=\"blink\"><path d=\"M23.5 37q2.5-3.6 5 0M35.5 37q2.5-3.6 5 0\" stroke=\"" + INK
                    + "\" stroke-width=\"2.4\" fill=\"none\" stroke-linecap=\"round\"/></g>";
            case 2 -> "<circle cx=\"26\" cy=\"36\" r=\"5\" fill=\"none\" stroke=\"" + INK + "\" stroke-width=\"2.2\"/>"
                    + "<circle cx=\"38\" cy=\"36\" r=\"5\" fill=\"none\" stroke=\"" + INK + "\" stroke-width=\"2.2\"/>"
                    + "<path d=\"M31 36h2\" stroke=\"" + INK + "\" stroke-width=\"2.2\"/>"
                    + "<g class=\"blink\"><circle cx=\"26\" cy=\"36.5\" r=\"1.7\" fill=\"" + INK + "\"/>"
                    + "<circle cx=\"38\" cy=\"36.5\" r=\"1.7\" fill=\"" + INK + "\"/></g>";
            case 3 -> "<g class=\"blink\">" + bean + "</g><path d=\"M35.5 36.5h5\" stroke=\"" + INK
                    + "\" stroke-width=\"2.4\" stroke-linecap=\"round\"/>";
            default -> "<g class=\"blink\">" + bean + "<rect x=\"36\" y=\"33\" width=\"4\" height=\"6.4\" rx=\"2\" "
                    + "fill=\"" + INK + "\"/></g>";
        };
    }

    /** 0: 미소, 1: 오, 2: 일자, 3: 활짝 */
    private static String mouth(int kind) {
        return switch (kind) {
            case 1 -> "<ellipse cx=\"32\" cy=\"45\" rx=\"1.8\" ry=\"2.3\" fill=\"" + INK + "\"/>";
            case 2 -> "<path d=\"M30 45h4\" stroke=\"" + INK + "\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>";
            case 3 -> "<path d=\"M28.5 43.5q3.5 5.4 7 0z\" fill=\"" + INK + "\"/>";
            default -> "<path d=\"M29.5 44q2.5 2.6 5 0\" stroke=\"" + INK
                    + "\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/>";
        };
    }
}
