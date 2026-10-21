package com.iq.anthology.web;

import com.iq.anthology.room.Avatar;
import com.iq.anthology.support.Texts;
import com.iq.anthology.anthology.Anthology;
import com.iq.anthology.anthology.Contributor;
import com.iq.anthology.essay.Essay;
import com.iq.anthology.essay.Shelf;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;

/** 문집 화면을 그리는 데 필요한 것을 미리 계산해 둔 읽기 모델. */
public record ShelfView(
        Anthology anthology,
        Contributor me,
        Essay myEssay,
        int myReplyCount,
        boolean unlocked,
        List<Card> cards,
        List<Seat> seats,
        long submittedCount,
        Long daysUntilDue) {

    private static final int EXCERPT_LENGTH = 110;
    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

    public static ShelfView of(Shelf shelf, Contributor me, LocalDate today) {
        return of(shelf, me, today, today.atStartOfDay(), java.util.Set.of());
    }

    /** now·inRoom: 참여자 목록에 "지금 모임방"·"30분 전" 같은 마지막 접속을 붙일 때 쓴다. */
    public static ShelfView of(Shelf shelf, Contributor me, LocalDate today, java.time.LocalDateTime now,
                               java.util.Set<Long> inRoom) {
        Anthology anthology = shelf.anthology();
        Essay myEssay = shelf.essayOf(me).orElse(null);
        boolean unlocked = me != null && (anthology.isClosed() || shelf.hasSubmitted(me));

        List<Card> cards = new ArrayList<>();
        for (Essay essay : shelf.submitted()) {
            Contributor writer = shelf.writerOf(essay);
            boolean readable = shelf.canRead(me, essay);
            cards.add(new Card(
                    essay.id(),
                    essay.title(),
                    writer.byline(),
                    readable ? excerpt(essay.body()) : null,
                    readable,
                    me != null && essay.isWrittenBy(me.id()),
                    essay.bodyLength(),
                    essay.readingMinutes(),
                    shelf.replyCountOf(essay),
                    essay.includedInBook(),
                    essay.publicSample(),
                    essay.submittedAt() == null ? 0 : essay.submittedAt().atZone(SEOUL).toInstant().toEpochMilli()));
        }

        List<Seat> seats = new ArrayList<>();
        for (Contributor contributor : anthology.contributors()) {
            Optional<Essay> essay = shelf.essayOf(contributor);
            String state = essay.map(e -> e.isSubmitted() ? "SUBMITTED" : "DRAFT").orElse("NONE");
            seats.add(new Seat(contributor.id(), contributor.nickname(), contributor.byline(), contributor.isEditor(),
                    me != null && contributor.id().equals(me.id()), state,
                    Avatar.svg(contributor.nickname(), contributor.joinOrder()),
                    inRoom.contains(contributor.id()) ? "지금 모임방" : Texts.ago(contributor.lastSeenAt(), now)));
        }

        return new ShelfView(anthology, me, myEssay, myEssay == null ? 0 : shelf.replyCountOf(myEssay), unlocked,
                cards, seats, shelf.submittedCount(), anthology.daysUntilDue(today).orElse(null));
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

    /** 내가 아닌 사람이 쓴, 지금 읽을 수 있는 글의 수. 제출 직후 "N편이 열렸어요"에 쓴다. */
    public long openedForMe() {
        return cards.stream().filter(card -> card.readable() && !card.mine()).count();
    }

    /** 아직 제출하지 않은 사람들(엮은이 재촉 문구용). */
    public List<Seat> notSubmitted() {
        return seats.stream().filter(seat -> !"SUBMITTED".equals(seat.state())).toList();
    }

    /** 엮은이가 카톡에 붙여 넣을 재촉 문구. */
    public String nudge(String inviteUrl) {
        List<String> names = notSubmitted().stream().map(Seat::nickname).toList();
        StringBuilder text = new StringBuilder();
        text.append("📚 『").append(anthology.bookTitle()).append("』 독후감 문집");
        if (daysUntilDue != null) {
            text.append(daysUntilDue == 0 ? " · 오늘 마감!" : " · 마감 D-" + daysUntilDue);
        }
        text.append("\n").append(anthology.contributors().size()).append("명 중 ").append(submittedCount)
                .append("명이 냈어요.");
        if (!names.isEmpty()) {
            text.append("\n아직: ").append(String.join(", ", names));
        }
        text.append("\n내 글을 내야 다른 사람 글이 열려요 👀\n").append(inviteUrl);
        return text.toString();
    }

    /**
     * 책장에 꽂힌 독후감 한 편. 잠겨 있으면 발췌가 비어 있다(본문은 서버에서 아예 보내지 않는다).
     *
     * @param submittedAtMillis "지난 방문 이후 새 글" 표시용
     */
    public record Card(Long essayId, String title, String byline, String excerpt, boolean readable, boolean mine,
                       int length, int minutes, int replyCount, boolean included, boolean publicSample,
                       long submittedAtMillis) {

        /** 잠긴 카드에 그리는 흐린 줄 수. 글이 길수록 많다. 내용은 드러나지 않는다. */
        public int lockLines() {
            if (length < 1200) {
                return 3;
            }
            return length < 3000 ? 4 : 5;
        }
    }

    /** 참여자 한 명과 그 사람의 진행 상태: NONE, DRAFT, SUBMITTED */
    /** lastSeen: "지금 모임방", "방금", "30분 전" … */
    public record Seat(Long id, String nickname, String byline, boolean editor, boolean me, String state,
                       String avatar, String lastSeen) {
    }
}
