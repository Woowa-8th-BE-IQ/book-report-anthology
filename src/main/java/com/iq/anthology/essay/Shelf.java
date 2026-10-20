package com.iq.anthology.essay;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import java.text.Collator;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;

/**
 * 문집의 독후감 책장. 누가 무엇을 읽을 수 있는지 정한다.
 *
 * <p>읽기 규칙: 내 글은 언제나 읽는다. 남의 글은 제출된 것만, 그리고 내가 제출했거나 마감된 뒤에만 읽는다.
 * "남의 독후감이 궁금하면 먼저 내 글을 낸다."
 */
public record Shelf(Anthology anthology, List<Essay> essays, Map<Long, List<Reply>> repliesByEssay) {

    private static final Collator KOREAN = Collator.getInstance(Locale.KOREAN);

    public Shelf {
        essays = List.copyOf(essays);
        repliesByEssay = Map.copyOf(repliesByEssay);
    }

    public Optional<Essay> essayOf(Contributor contributor) {
        if (contributor == null) {
            return Optional.empty();
        }
        return essays.stream().filter(essay -> essay.isWrittenBy(contributor.id())).findFirst();
    }

    public boolean canRead(Contributor viewer, Essay essay) {
        if (viewer == null) {
            return false;
        }
        if (essay.isWrittenBy(viewer.id())) {
            return true;
        }
        return essay.isSubmitted() && (anthology.isClosed() || hasSubmitted(viewer));
    }

    public boolean hasSubmitted(Contributor contributor) {
        return essayOf(contributor).map(Essay::isSubmitted).orElse(false);
    }

    /** 제출된 독후감, 책에 실리는 순서(닉네임 가나다순). */
    public List<Essay> submitted() {
        return essays.stream()
                .filter(Essay::isSubmitted)
                .sorted(bookOrder())
                .toList();
    }

    public long submittedCount() {
        return essays.stream().filter(Essay::isSubmitted).count();
    }

    public List<Reply> repliesOf(Essay essay) {
        return repliesByEssay.getOrDefault(essay.id(), List.of()).stream()
                .sorted(Comparator.comparing(Reply::createdAt).thenComparing(Reply::id))
                .toList();
    }

    public Contributor writerOf(Essay essay) {
        return anthology.contributorById(essay.contributorId());
    }

    /** 레퍼런스 문집처럼 닉네임 가나다순. 같으면 먼저 낸 순서. */
    private Comparator<Essay> bookOrder() {
        return Comparator.<Essay, String>comparing(essay -> writerOf(essay).nickname(), KOREAN)
                .thenComparing(Essay::submittedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Essay::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    public boolean isEmpty() {
        return essays.isEmpty();
    }

    public Optional<Essay> findById(Long essayId) {
        return essays.stream().filter(essay -> Objects.equals(essay.id(), essayId)).findFirst();
    }
}
