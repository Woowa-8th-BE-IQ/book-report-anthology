package com.iq.anthology.room;

import com.iq.anthology.support.DomainException;
import java.util.random.RandomGenerator;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 아바타를 이루는 조각들의 번호. 글자로는 {@code c3b1e2m0x4k1}처럼 적는다(색·몸·눈·입·소품·볼).
 * 사람이 고르지 않았으면 닉네임과 참여 순서로 정한다({@link #derived}). 예전에 보이던 얼굴과 똑같다.
 */
public record AvatarStyle(int color, int body, int eyes, int mouth, int extra, int cheeks) {

    public static final int COLORS = 10;
    public static final int BODIES = 5;
    public static final int EYES = 4;
    public static final int MOUTHS = 4;
    public static final int EXTRAS = 6;
    public static final int CHEEKS = 2;

    private static final Pattern FORMAT = Pattern.compile("c(\\d{1,2})b(\\d)e(\\d)m(\\d)x(\\d)k(\\d)");

    public AvatarStyle {
        check(color, COLORS, "색");
        check(body, BODIES, "몸");
        check(eyes, EYES, "눈");
        check(mouth, MOUTHS, "입");
        check(extra, EXTRAS, "소품");
        check(cheeks, CHEEKS, "볼");
    }

    public static AvatarStyle parse(String text) {
        Matcher matcher = FORMAT.matcher(text == null ? "" : text.strip());
        if (!matcher.matches()) {
            throw DomainException.rule("캐릭터 모양을 알아볼 수 없어요.");
        }
        return new AvatarStyle(
                Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)),
                Integer.parseInt(matcher.group(3)), Integer.parseInt(matcher.group(4)),
                Integer.parseInt(matcher.group(5)), Integer.parseInt(matcher.group(6)));
    }

    /** 고르지 않은 사람의 얼굴. 색은 참여 순서로 돌려 옆자리끼리 겹치지 않게 하고, 나머지는 닉네임에서 고른다. */
    public static AvatarStyle derived(String nickname, int joinOrder) {
        int seed = mix(nickname);
        return new AvatarStyle(
                Math.floorMod(joinOrder - 1, 8), // 처음 8색 안에서만 돌린다(예전 얼굴 그대로)
                pick(seed, 0, 3),
                pick(seed, 2, 4),
                pick(seed, 3, 4),
                pick(seed, 1, 5),
                pick(seed, 4, 2) == 0 ? 1 : 0);
    }

    public static AvatarStyle random(RandomGenerator random) {
        return new AvatarStyle(random.nextInt(COLORS), random.nextInt(BODIES), random.nextInt(EYES),
                random.nextInt(MOUTHS), random.nextInt(EXTRAS), random.nextInt(CHEEKS));
    }

    public String format() {
        return "c" + color + "b" + body + "e" + eyes + "m" + mouth + "x" + extra + "k" + cheeks;
    }

    public AvatarStyle withColor(int value) {
        return new AvatarStyle(value, body, eyes, mouth, extra, cheeks);
    }

    public AvatarStyle withBody(int value) {
        return new AvatarStyle(color, value, eyes, mouth, extra, cheeks);
    }

    public AvatarStyle withEyes(int value) {
        return new AvatarStyle(color, body, value, mouth, extra, cheeks);
    }

    public AvatarStyle withMouth(int value) {
        return new AvatarStyle(color, body, eyes, value, extra, cheeks);
    }

    public AvatarStyle withExtra(int value) {
        return new AvatarStyle(color, body, eyes, mouth, value, cheeks);
    }

    public AvatarStyle withCheeks(int value) {
        return new AvatarStyle(color, body, eyes, mouth, extra, value);
    }

    private static void check(int value, int count, String part) {
        if (value < 0 || value >= count) {
            throw DomainException.rule("고를 수 없는 " + part + " 모양이에요.");
        }
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
