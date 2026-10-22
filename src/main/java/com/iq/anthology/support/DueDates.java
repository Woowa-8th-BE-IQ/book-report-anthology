package com.iq.anthology.support;

import java.time.DateTimeException;
import java.time.LocalDate;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 마감일을 사람이 쓰는 대로 읽는다. 연도는 안 써도 된다.
 *
 * <p>"11.30", "11/30", "1130", "11월 30일", "26.11.30", "2026-11-30" 모두 2026년 11월 30일이다.
 * 연도를 안 쓰면 올해로 보고, 이미 지난 날이면 내년으로 본다(12월에 "1.10"을 쓰면 내년 1월 10일).
 */
public final class DueDates {

    private static final Pattern FULL = Pattern.compile("(\\d{2}|\\d{4})\\s*[.\\-/년]\\s*(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})\\s*일?\\.?");
    private static final Pattern MONTH_DAY = Pattern.compile("(\\d{1,2})\\s*[.\\-/월]\\s*(\\d{1,2})\\s*일?\\.?");
    private static final Pattern COMPACT = Pattern.compile("(\\d{2})(\\d{2})");
    private static final Pattern COMPACT_FULL = Pattern.compile("(\\d{4})(\\d{2})(\\d{2})");

    private DueDates() {
    }

    /** 비어 있으면 null(마감일 없음). 알아볼 수 없으면 규칙 위반. */
    public static LocalDate parse(String text, LocalDate today) {
        String value = text == null ? "" : text.strip();
        if (value.isEmpty()) {
            return null;
        }
        try {
            Matcher matcher;
            if ((matcher = FULL.matcher(value)).matches()) {
                int year = Integer.parseInt(matcher.group(1));
                return LocalDate.of(year < 100 ? 2000 + year : year,
                        Integer.parseInt(matcher.group(2)), Integer.parseInt(matcher.group(3)));
            }
            if ((matcher = COMPACT_FULL.matcher(value)).matches()) {
                return LocalDate.of(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)),
                        Integer.parseInt(matcher.group(3)));
            }
            if ((matcher = MONTH_DAY.matcher(value)).matches() || (matcher = COMPACT.matcher(value)).matches()) {
                return nearest(Integer.parseInt(matcher.group(1)), Integer.parseInt(matcher.group(2)), today);
            }
        } catch (DateTimeException e) {
            throw DomainException.rule("없는 날짜예요. 11.30처럼 월.일로 써 주세요.");
        }
        throw DomainException.rule("마감일을 알아볼 수 없어요. 11.30처럼 월.일로 써 주세요.");
    }

    private static LocalDate nearest(int month, int day, LocalDate today) {
        LocalDate thisYear = LocalDate.of(today.getYear(), month, day);
        return thisYear.isBefore(today) ? LocalDate.of(today.getYear() + 1, month, day) : thisYear;
    }
}
