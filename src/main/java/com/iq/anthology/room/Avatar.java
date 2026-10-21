package com.iq.anthology.room;

/**
 * 참여자 아바타. 그림 파일 없이 닉네임과 참여 순서로 SVG를 만든다. 같은 사람은 언제나 같은 얼굴이다.
 *
 * <p>색은 참여 순서로 돌려서 옆자리끼리 겹치지 않게 하고, 얼굴 모양·눈·입·소품은 닉네임에서 고른다.
 * 사용자 글자는 그림 안에 넣지 않으므로 그대로 HTML에 넣어도 안전하다.
 */
public final class Avatar {

    private static final String INK = "#1A1208";
    private static final String[] COLORS = {
            "#E8A87C", "#9DB58A", "#8FB3C9", "#C9A3C4", "#E3C26B", "#D98F7E", "#A9C2B0", "#C4A484"};

    private Avatar() {
    }

    public static String svg(String nickname, int joinOrder) {
        int seed = mix(nickname);
        String color = COLORS[Math.floorMod(joinOrder - 1, COLORS.length)];
        StringBuilder svg = new StringBuilder(1200)
                .append("<svg class=\"avatar-svg\" viewBox=\"0 0 64 64\" xmlns=\"http://www.w3.org/2000/svg\" "
                        + "aria-hidden=\"true\" focusable=\"false\">");
        svg.append(body(pick(seed, 0, 3), color));
        svg.append(extra(pick(seed, 1, 5), color));
        svg.append(eyes(pick(seed, 2, 4)));
        svg.append(mouth(pick(seed, 3, 4)));
        if (pick(seed, 4, 2) == 0) {
            svg.append("<circle cx=\"20\" cy=\"41\" r=\"3.4\" fill=\"#fff\" opacity=\".35\"/>"
                    + "<circle cx=\"44\" cy=\"41\" r=\"3.4\" fill=\"#fff\" opacity=\".35\"/>");
        }
        return svg.append("</svg>").toString();
    }

    /** 0: 동그라미, 1: 책(왼쪽 책등), 2: 살짝 기운 네모 */
    private static String body(int kind, String color) {
        return switch (kind) {
            case 0 -> "<circle cx=\"32\" cy=\"35\" r=\"22\" fill=\"" + color + "\"/>";
            case 1 -> "<rect x=\"12\" y=\"13\" width=\"40\" height=\"44\" rx=\"5\" fill=\"" + color + "\"/>"
                    + "<rect x=\"12\" y=\"13\" width=\"6\" height=\"44\" rx=\"3\" fill=\"" + INK + "\" opacity=\".18\"/>";
            default -> "<rect x=\"11\" y=\"14\" width=\"42\" height=\"42\" rx=\"14\" fill=\"" + color
                    + "\" transform=\"rotate(-6 32 35)\"/>";
        };
    }

    /** 0: 없음, 1: 책갈피 끈, 2: 베레모, 3: 새싹, 4: 작은 별 */
    private static String extra(int kind, String color) {
        return switch (kind) {
            case 1 -> "<path d=\"M40 9 v13 l3 -3 l3 3 v-13 z\" fill=\"#B8571A\"/>";
            case 2 -> "<ellipse cx=\"30\" cy=\"15\" rx=\"15\" ry=\"6\" fill=\"" + INK + "\" opacity=\".82\"/>"
                    + "<circle cx=\"31\" cy=\"9\" r=\"2.2\" fill=\"" + INK + "\" opacity=\".82\"/>";
            case 3 -> "<path d=\"M32 14 v-6\" stroke=\"#4F6B3A\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>"
                    + "<path d=\"M32 9 c-6 -1 -8 -5 -8 -5 c5 -1 8 2 8 5z M32 8 c5 -2 8 -1 9 1 c-3 3 -7 2 -9 -1z\" "
                    + "fill=\"#4F6B3A\"/>";
            case 4 -> "<path d=\"M50 10 l1.6 3.4 3.6 .5 -2.6 2.5 .6 3.6 -3.2 -1.7 -3.2 1.7 .6 -3.6 -2.6 -2.5 3.6 -.5z\" "
                    + "fill=\"#E3C26B\" stroke=\"" + INK + "\" stroke-width=\".6\"/>";
            default -> "";
        };
    }

    /** 0: 점, 1: 웃는 눈, 2: 동그란 안경, 3: 윙크 */
    private static String eyes(int kind) {
        return switch (kind) {
            case 1 -> "<path d=\"M21 34 q3 -4 6 0 M37 34 q3 -4 6 0\" stroke=\"" + INK
                    + "\" stroke-width=\"2.2\" fill=\"none\" stroke-linecap=\"round\"/>";
            case 2 -> "<circle cx=\"24\" cy=\"33\" r=\"5.5\" fill=\"#fff\" fill-opacity=\".35\" stroke=\"" + INK
                    + "\" stroke-width=\"1.8\"/><circle cx=\"40\" cy=\"33\" r=\"5.5\" fill=\"#fff\" fill-opacity=\".35\" "
                    + "stroke=\"" + INK + "\" stroke-width=\"1.8\"/><path d=\"M29.5 33 h5\" stroke=\"" + INK
                    + "\" stroke-width=\"1.8\"/><circle cx=\"24\" cy=\"33\" r=\"1.7\" fill=\"" + INK
                    + "\"/><circle cx=\"40\" cy=\"33\" r=\"1.7\" fill=\"" + INK + "\"/>";
            case 3 -> "<circle cx=\"24\" cy=\"33\" r=\"2.4\" fill=\"" + INK + "\"/><path d=\"M37 33 h6\" stroke=\""
                    + INK + "\" stroke-width=\"2.2\" stroke-linecap=\"round\"/>";
            default -> "<circle cx=\"24\" cy=\"33\" r=\"2.4\" fill=\"" + INK + "\"/><circle cx=\"40\" cy=\"33\" r=\"2.4\" fill=\""
                    + INK + "\"/>";
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

    private static int pick(int seed, int slot, int choices) {
        return Math.floorMod(Integer.rotateRight(seed, slot * 7) ^ (slot * 0x9E3779B9), choices);
    }

    /** String.hashCode를 한 번 더 섞어 비슷한 닉네임끼리도 얼굴이 갈리게 한다. */
    private static int mix(String text) {
        int h = text.hashCode();
        h ^= h >>> 16;
        h *= 0x85EBCA6B;
        h ^= h >>> 13;
        h *= 0xC2B2AE35;
        return h ^ (h >>> 16);
    }
}
