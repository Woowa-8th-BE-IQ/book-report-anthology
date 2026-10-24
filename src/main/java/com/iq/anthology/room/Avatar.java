package com.iq.anthology.room;

import com.iq.anthology.anthology.Contributor;

/**
 * 참여자 아바타 SVG. 여덟 책 동물({@link Critter}) 중 하나를 그린다.
 * 사용자 글자는 그림 안에 넣지 않으므로 그대로 HTML에 넣어도 안전하다.
 * 얼굴은 {@code <g class="face">}로 묶여 있어 화면이 시선을 돌리고, {@code .blink}가 있으면 눈을 깜빡인다.
 */
public final class Avatar {

    /**
     * 손으로 그린 듯 선을 살짝 흔드는 필터. 그림마다 같은 정의를 넣는다(같은 id라 어느 것을 써도 같다).
     * 화면 맨 위에도 하나 두어(layout), 숨겨진 그림의 정의를 먼저 집어도 흔들림이 사라지지 않게 한다.
     */
    public static final String WOBBLE = "<defs><filter id=\"wob\" x=\"-5%\" y=\"-5%\" width=\"110%\" height=\"110%\">"
            + "<feTurbulence type=\"fractalNoise\" baseFrequency=\"0.06\" numOctaves=\"2\" seed=\"3\"/>"
            + "<feDisplacementMap in=\"SourceGraphic\" scale=\"1.5\"/></filter></defs>";

    private static final String OPEN = "<svg class=\"avatar-svg\" viewBox=\"0 0 64 64\" "
            + "xmlns=\"http://www.w3.org/2000/svg\" aria-hidden=\"true\" focusable=\"false\">";
    private static final String CLOSE = "</svg>";

    private Avatar() {
    }

    /** 고른 캐릭터가 있으면 그것으로, 없으면 참여 순서로 받은 캐릭터로 그린다. */
    public static String of(Contributor contributor) {
        return svg(critterOf(contributor));
    }

    /** 예전 꾸미기 값(c3b1e2m0x4k1 같은)이나 깨진 값은 참여 순서로 받은 캐릭터로 본다. */
    public static Critter critterOf(Contributor contributor) {
        return Critter.find(contributor.avatarStyle())
                .orElseGet(() -> Critter.derived(contributor.joinOrder()));
    }

    public static String svg(Critter critter) {
        return OPEN + WOBBLE + "<g filter=\"url(#wob)\">" + critter.art() + "</g>" + CLOSE;
    }
}
