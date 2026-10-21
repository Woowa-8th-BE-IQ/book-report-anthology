package com.iq.anthology.room;

import com.iq.anthology.anthology.Contributor;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;

/**
 * 말 속의 "@닉네임"으로 누구를 불렀는지 찾는다.
 *
 * <p>"@" 바로 뒤에 오는 닉네임 중 가장 긴 것을 고른다. 그래서 "@민수님"은 민수를, "@민수정"은
 * (민수정이 있으면) 민수정을 부른다. "@모두"는 말한 사람을 뺀 모두를 부른다.
 */
public final class Mentions {

    public static final String EVERYONE = "모두";

    private Mentions() {
    }

    public static Set<Long> find(String body, List<Contributor> contributors, Long speakerId) {
        Set<Long> called = new LinkedHashSet<>();
        if (body == null || body.indexOf('@') < 0) {
            return called;
        }
        List<Contributor> longestFirst = contributors.stream()
                .sorted(Comparator.comparingInt((Contributor c) -> c.nickname().length()).reversed())
                .toList();
        for (int at = body.indexOf('@'); at >= 0; at = body.indexOf('@', at + 1)) {
            String rest = body.substring(at + 1);
            Contributor match = longestFirst.stream()
                    .filter(contributor -> rest.startsWith(contributor.nickname()))
                    .findFirst()
                    .orElse(null);
            if (match != null) {
                called.add(match.id());
            } else if (rest.startsWith(EVERYONE)) {
                contributors.forEach(contributor -> called.add(contributor.id()));
            }
        }
        called.remove(speakerId); // 나를 부른 건 알리지 않는다
        return called;
    }
}
