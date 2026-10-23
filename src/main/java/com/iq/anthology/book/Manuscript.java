package com.iq.anthology.book;

import java.time.LocalDate;
import java.util.List;
import java.util.Objects;

/**
 * 출간용 원고. 제출된 독후감 중 책에 넣기로 한 것을 닉네임 가나다순으로 담는다.
 *
 * @param identifier   전자책 고유 식별자 (urn:uuid:...)
 * @param title        문집 제목
 * @param citation     함께 읽은 책의 출처 표기. 예: 마틴 파울러, 『리팩터링』
 * @param readLine     받침에 맞춘 "~을/를 읽고". 예: 마틴 파울러, 『리팩터링』을 읽고
 * @param introduction 도서 소개 (없을 수 있다)
 * @param closedOn     마감한 날
 * @param pieces       실리는 독후감, 책 순서
 * @param prompts      엮은이의 글감 질문 (없을 수 있다)
 * @param appendix     부록 (없을 수 있다)
 * @param talks        모임방에서 책갈피를 받은 말, 날짜별 (없을 수 있다)
 */
public record Manuscript(String identifier, String title, String citation, String readLine, String introduction,
                         LocalDate closedOn, List<Piece> pieces, List<String> prompts, String appendix,
                         List<TalkDay> talks) {

    public Manuscript(String identifier, String title, String citation, String readLine, String introduction,
                      LocalDate closedOn, List<Piece> pieces) {
        this(identifier, title, citation, readLine, introduction, closedOn, pieces, List.of(), null, List.of());
    }

    public Manuscript(String identifier, String title, String citation, String readLine, String introduction,
                      LocalDate closedOn, List<Piece> pieces, List<String> prompts, String appendix) {
        this(identifier, title, citation, readLine, introduction, closedOn, pieces, prompts, appendix, List.of());
    }

    public Manuscript {
        Objects.requireNonNull(identifier);
        Objects.requireNonNull(title);
        Objects.requireNonNull(citation);
        Objects.requireNonNull(readLine);
        Objects.requireNonNull(closedOn);
        pieces = List.copyOf(pieces);
        prompts = prompts == null ? List.of() : List.copyOf(prompts);
        talks = talks == null ? List.of() : List.copyOf(talks);
    }

    /** "함께 나눈 이야기" 장을 만들지. */
    public boolean hasTalks() {
        return !talks.isEmpty();
    }

    public boolean hasPrompts() {
        return !prompts.isEmpty();
    }

    public boolean hasAppendix() {
        return appendix != null;
    }

    /** 도서 소개 쪽을 만들지. 소개나 질문 중 하나라도 있으면 만든다. */
    public boolean hasFrontMatter() {
        return hasIntroduction() || hasPrompts();
    }

    public List<String> bylines() {
        return pieces.stream().map(Piece::byline).toList();
    }

    public boolean hasIntroduction() {
        return introduction != null;
    }

    /** 하루치 대화. day는 "10월 21일" 꼴. */
    public record TalkDay(String day, List<TalkLine> lines) {

        public TalkDay {
            Objects.requireNonNull(day);
            lines = List.copyOf(lines);
        }
    }

    /** 책갈피를 받은 말 한 마디. marks는 책갈피 수. */
    public record TalkLine(String speaker, String body, int marks) {

        public TalkLine {
            Objects.requireNonNull(speaker);
            Objects.requireNonNull(body);
        }
    }

    /**
     * 독후감 한 편.
     *
     * @param number 책 안의 순서 (1부터)
     * @param byline 닉네임(실명)
     */
    public record Piece(int number, String title, String byline, String quote, String body) {

        public Piece {
            Objects.requireNonNull(title);
            Objects.requireNonNull(byline);
            Objects.requireNonNull(body);
        }

        public boolean hasQuote() {
            return quote != null;
        }
    }
}
