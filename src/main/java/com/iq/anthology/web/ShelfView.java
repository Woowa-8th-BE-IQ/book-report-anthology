package com.iq.anthology.web;

import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.Shelf;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 문집 화면을 그리는 데 필요한 것을 미리 계산해 둔 읽기 모델. */
public record ShelfView(
        Anthology anthology,
        Contributor me,
        Essay myEssay,
        boolean unlocked,
        List<Card> cards,
        List<Seat> seats,
        long submittedCount,
        Long daysUntilDue) {

    private static final int EXCERPT_LENGTH = 110;

    public static ShelfView of(Shelf shelf, Contributor me, LocalDate today) {
        Anthology anthology = shelf.anthology();
        Essay myEssay = shelf.essayOf(me).orElse(null);
        boolean unlocked = me != null && (anthology.isClosed() || shelf.hasSubmitted(me));

        List<Card> cards = new ArrayList<>();
        for (Essay essay : shelf.submitted()) {
            Contributor writer = shelf.writerOf(essay);
            boolean readable = shelf.canRead(me, essay);
            cards.add(new Card(essay.id(), essay.title(), writer.byline(),
                    readable ? excerpt(essay.body()) : null,
                    readable, essay.isWrittenBy(me == null ? null : me.id()),
                    essay.bodyLength(), shelf.repliesOf(essay).size(), essay.includedInBook()));
        }

        List<Seat> seats = new ArrayList<>();
        for (Contributor contributor : anthology.contributors()) {
            Optional<Essay> essay = shelf.essayOf(contributor);
            String state = essay.map(e -> e.isSubmitted() ? "SUBMITTED" : "DRAFT").orElse("NONE");
            seats.add(new Seat(contributor.byline(), contributor.isEditor(),
                    me != null && contributor.id().equals(me.id()), state));
        }

        return new ShelfView(anthology, me, myEssay, unlocked, cards, seats, shelf.submittedCount(),
                anthology.daysUntilDue(today).orElse(null));
    }

    private static String excerpt(String body) {
        String flat = body.replaceAll("\\s+", " ").strip();
        if (flat.codePointCount(0, flat.length()) <= EXCERPT_LENGTH) {
            return flat;
        }
        return flat.substring(0, flat.offsetByCodePoints(0, EXCERPT_LENGTH)) + "…";
    }

    public boolean isContributor() {
        return me != null;
    }

    public boolean isEditor() {
        return me != null && me.isEditor();
    }

    public boolean canJoin() {
        return me == null && !anthology.isClosed() && !anthology.isFull();
    }

    public boolean hasSubmitted() {
        return myEssay != null && myEssay.isSubmitted();
    }

    public boolean hasDraft() {
        return myEssay != null && !myEssay.isSubmitted();
    }

    public int progressPercent() {
        int total = anthology.contributors().size();
        return total == 0 ? 0 : (int) (submittedCount * 100 / total);
    }

    public boolean canClose() {
        return isEditor() && !anthology.isClosed() && submittedCount >= Anthology.MIN_ESSAYS_TO_CLOSE;
    }

    /** 책장에 꽂힌 독후감 한 편. 잠겨 있으면 발췌가 비어 있다. */
    public record Card(Long essayId, String title, String byline, String excerpt, boolean readable,
                       boolean mine, int length, int replyCount, boolean included) {
    }

    /** 참여자 한 명과 그 사람의 진행 상태: NONE, DRAFT, SUBMITTED */
    public record Seat(String byline, boolean editor, boolean me, String state) {
    }
}
