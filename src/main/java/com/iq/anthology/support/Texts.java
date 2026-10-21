package com.iq.anthology.support;

public final class Texts {

    private static final char HANGUL_FIRST = '가';
    private static final char HANGUL_LAST = '힣';

    private Texts() {
    }

    public static String trimToNull(String value) {
        if (value == null) {
            return null;
        }
        String trimmed = value.strip();
        return trimmed.isEmpty() ? null : trimmed;
    }

    /** 사람이 세는 글자 수(코드 포인트 기준). 한글·이모지 모두 한 글자로 센다. */
    public static int length(String value) {
        return value == null ? 0 : value.codePointCount(0, value.length());
    }

    public static String required(String value, String field, int min, int max) {
        String trimmed = trimToNull(value);
        if (trimmed == null) {
            throw DomainException.rule(field + josa(field, "을", "를") + " 입력해 주세요.");
        }
        int length = length(trimmed);
        if (length < min || length > max) {
            throw DomainException.rule(field + josa(field, "은", "는") + " " + min + "~" + max
                    + "자로 써 주세요. (지금 " + length + "자)");
        }
        return trimmed;
    }

    public static String optional(String value, String field, int max) {
        String trimmed = trimToNull(value);
        if (trimmed != null && length(trimmed) > max) {
            throw DomainException.rule(field + josa(field, "은", "는") + " 최대 " + max + "자예요. (지금 "
                    + length(trimmed) + "자)");
        }
        return trimmed;
    }

    /** 마지막 글자에 받침이 있으면 앞의 조사, 없으면 뒤의 조사. 예: 제목을, 본문을, 소개를 */
    public static String josa(String word, String withFinal, String withoutFinal) {
        if (word == null || word.isEmpty()) {
            return withoutFinal;
        }
        char last = word.charAt(word.length() - 1);
        if (last < HANGUL_FIRST || last > HANGUL_LAST) {
            return withFinal;
        }
        return (last - HANGUL_FIRST) % 28 == 0 ? withoutFinal : withFinal;
    }

    /** 사람이 읽는 지난 시간. 예: 방금, 30분 전, 3시간 전, 어제, 5일 전, 9월 2일 */
    public static String ago(java.time.LocalDateTime then, java.time.LocalDateTime now) {
        java.time.Duration elapsed = java.time.Duration.between(then, now);
        long minutes = Math.max(0, elapsed.toMinutes());
        if (minutes < 1) {
            return "방금";
        }
        if (minutes < 60) {
            return minutes + "분 전";
        }
        if (minutes < 24 * 60) {
            return (minutes / 60) + "시간 전";
        }
        long days = java.time.temporal.ChronoUnit.DAYS.between(then.toLocalDate(), now.toLocalDate());
        if (days <= 1) {
            return "어제";
        }
        if (days < 30) {
            return days + "일 전";
        }
        return then.getMonthValue() + "월 " + then.getDayOfMonth() + "일";
    }
}
