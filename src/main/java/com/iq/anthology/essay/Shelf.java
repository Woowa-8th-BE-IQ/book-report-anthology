package com.iq.anthology.essay;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.support.DomainException;
import java.text.Collator;
import java.util.ArrayList;
import java.util.Collections;
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

    /**
     * 책 순서. 엮은이가 정한 순서가 있으면 그것이 먼저이고, 없으면 레퍼런스 문집처럼 닉네임 가나다순.
     * 같으면 먼저 낸 순서.
     */
    private Comparator<Essay> bookOrder() {
        return Comparator.<Essay, Integer>comparing(Essay::bookOrder, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(essay -> writerOf(essay).nickname(), KOREAN)
                .thenComparing(Essay::submittedAt, Comparator.nullsLast(Comparator.naturalOrder()))
                .thenComparing(Essay::id, Comparator.nullsLast(Comparator.naturalOrder()));
    }

    /**
     * 엮은이가 한 편을 앞(-1)이나 뒤(+1)로 옮긴다. 마감 뒤에만. 옮긴 결과대로 모든 글에 1부터 순서를 매기고,
     * 순서가 바뀐 글들을 돌려준다(저장 대상).
     */
    public List<Essay> move(Contributor requester, Long essayId, int delta) {
        if (!requester.isEditor()) {
            throw DomainException.forbidden("순서는 엮은이만 바꿀 수 있어요.");
        }
        if (!anthology.isClosed()) {
            throw DomainException.rule("순서는 마감한 뒤에 정할 수 있어요.");
        }
        if (delta != -1 && delta != 1) {
            throw DomainException.rule("한 칸씩만 옮길 수 있어요.");
        }
        List<Essay> order = new ArrayList<>(submitted());
        int from = indexOf(order, essayId);
        int to = from + delta;
        if (to < 0 || to >= order.size()) {
            return List.of();
        }
        Collections.swap(order, from, to);
        List<Essay> changed = new ArrayList<>();
        for (int position = 0; position < order.size(); position++) {
            Essay essay = order.get(position);
            if (!Objects.equals(essay.bookOrder(), position + 1)) {
                essay.placeAt(position + 1);
                changed.add(essay);
            }
        }
        return changed;
    }

    private static int indexOf(List<Essay> order, Long essayId) {
        for (int i = 0; i < order.size(); i++) {
            if (Objects.equals(order.get(i).id(), essayId)) {
                return i;
            }
        }
        throw DomainException.notFound("책에 실린 독후감이 아니에요.");
    }

    /** 공개 소개 페이지의 맛보기 한 편. 쓴 사람이 동의했고 책에 실리는 글 중 책 순서로 첫 번째. */
    public Optional<Essay> publicSample() {
        if (!anthology.isClosed()) {
            return Optional.empty();
        }
        return submitted().stream()
                .filter(essay -> essay.includedInBook() && essay.publicSample())
                .findFirst();
    }

    /** 마감 전 모으는 중에 아직 제출하지 않은 사람들. 엮은이의 재촉 문구에 쓴다. */
    public List<Contributor> notSubmitted() {
        return anthology.contributors().stream()
                .filter(contributor -> !hasSubmitted(contributor))
                .toList();
    }

    public int replyCountOf(Essay essay) {
        return repliesByEssay.getOrDefault(essay.id(), List.of()).size();
    }

    public boolean isEmpty() {
        return essays.isEmpty();
    }

    public Optional<Essay> findById(Long essayId) {
        return essays.stream().filter(essay -> Objects.equals(essay.id(), essayId)).findFirst();
    }
}
